import { Database } from "bun:sqlite"
import { randomUUID } from "crypto"
import { createDb, floatsToBlob, blobToFloats, cosineSimilarity, getDbSize } from "./db"
import { vectorSearch, expandGraph } from "./retrieval/vector"
import { ftsSearch } from "./retrieval/fts"
import { hybridSearch } from "./retrieval/hybrid"
import type { Embedder } from "./embeddings/types"
import type {
  RetrievalMethod,
  AddMemoryInput,
  AddMemoryResult,
  SearchMemoryInput,
  SearchResult,
  DeleteMemoryInput,
  ListSessionsInput,
  GetGraphInput,
  GraphResult,
  ForgetSessionInput,
  EnsureSessionInput,
  Session,
  MemoryMetadata,
  MemoryStats,
} from "./types"

export interface MemoryEngineConfig {
  retrieval: RetrievalMethod
  embedder?: Embedder
  dbPath?: string
  windowSize?: number
  edgeThreshold?: number
  edgeTopK?: number
  hybridFtsWeight?: number
  hybridVectorWeight?: number
}

export class MemoryEngine {
  private db: Database
  private retrieval: RetrievalMethod
  private embedder?: Embedder
  private windowSize: number
  private edgeThreshold: number
  private edgeTopK: number
  private hybridFtsWeight: number
  private hybridVectorWeight: number

  constructor(config: MemoryEngineConfig) {
    if ((config.retrieval === "vector" || config.retrieval === "hybrid") && !config.embedder) {
      throw new Error(`MemoryEngine: retrieval="${config.retrieval}" requires an embedder`)
    }
    this.retrieval = config.retrieval
    this.embedder = config.embedder
    this.windowSize = config.windowSize ?? 40
    this.edgeThreshold = config.edgeThreshold ?? 0.82
    this.edgeTopK = config.edgeTopK ?? 10
    this.hybridFtsWeight = config.hybridFtsWeight ?? 0.3
    this.hybridVectorWeight = config.hybridVectorWeight ?? 0.7
    this.db = createDb(config.dbPath, config.retrieval)
  }

  ensureSession(input: EnsureSessionInput): Session {
    const now = Date.now()
    const existing = this.db
      .query<Session, [string]>(
        "SELECT id, project_id, label, created_at, updated_at FROM session WHERE id = ?"
      )
      .get(input.session_id)
    if (existing) return existing
    this.db.run(
      "INSERT INTO session (id, project_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [input.session_id, input.project_id, input.label ?? null, now, now]
    )
    return { id: input.session_id, project_id: input.project_id, label: input.label, created_at: now, updated_at: now }
  }

  async add(input: AddMemoryInput): Promise<AddMemoryResult> {
    this.ensureSession({ session_id: input.session_id, project_id: input.project_id })

    let embBlob: Buffer | null = null
    let embedding: number[] | null = null
    let dimensions: number | null = null

    if (this.embedder) {
      embedding = await this.embedder.embed(input.content)
      embBlob = floatsToBlob(embedding)
      dimensions = this.embedder.dimensions
    }

    const id = `mem_${randomUUID().replace(/-/g, "")}`
    const now = Date.now()

    this.db.run(
      `INSERT INTO memory (id, session_id, project_id, content, metadata, embedding, dimensions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.session_id,
        input.project_id,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        embBlob,
        dimensions,
        now,
        now,
      ]
    )

    let linked = 0

    if (embedding && (this.retrieval === "vector" || this.retrieval === "hybrid")) {
      const neighbors = this.db
        .query<{ id: string; embedding: Buffer }, [string, string]>(
          "SELECT id, embedding FROM memory WHERE project_id = ? AND id != ? AND embedding IS NOT NULL"
        )
        .all(input.project_id, id)

      for (const neighbor of neighbors.slice(0, this.edgeTopK * 4)) {
        const neighborEmb = blobToFloats(neighbor.embedding)
        const score = cosineSimilarity(embedding, neighborEmb)
        if (score >= this.edgeThreshold) {
          const edgeId = `edge_${randomUUID().replace(/-/g, "")}`
          try {
            this.db.run(
              "INSERT OR IGNORE INTO memory_edge (id, src_id, dst_id, score, created_at) VALUES (?, ?, ?, ?, ?)",
              [edgeId, id, neighbor.id, score, now]
            )
            linked++
          } catch {}
        }
        if (linked >= this.edgeTopK) break
      }
    }

    return { id, linked_count: linked }
  }

  async search(input: SearchMemoryInput): Promise<SearchResult[]> {
    const enriched: SearchMemoryInput = {
      ...input,
      window_size: input.window_size ?? this.windowSize,
    }

    if (this.retrieval === "vector") {
      return vectorSearch(this.db, enriched, this.embedder!, this.edgeThreshold, this.edgeTopK)
    }
    if (this.retrieval === "hybrid") {
      return hybridSearch(
        this.db,
        enriched,
        this.embedder!,
        this.edgeThreshold,
        this.edgeTopK,
        this.hybridFtsWeight,
        this.hybridVectorWeight
      )
    }
    return ftsSearch(this.db, enriched)
  }

  delete(id: string): void {
    this.db.run("DELETE FROM memory WHERE id = ?", [id])
  }

  listSessions(input: ListSessionsInput): Session[] {
    if (input.project_id) {
      return this.db
        .query<Session, [string]>(
          "SELECT id, project_id, label, created_at, updated_at FROM session WHERE project_id = ? ORDER BY created_at DESC"
        )
        .all(input.project_id)
    }
    return this.db
      .query<Session, []>(
        "SELECT id, project_id, label, created_at, updated_at FROM session ORDER BY created_at DESC"
      )
      .all()
  }

  getGraph(input: GetGraphInput): GraphResult {
    if (this.retrieval === "fts") {
      throw new Error("getGraph is not supported in fts retrieval mode")
    }

    const visited = new Set<string>()
    const nodeMap = new Map<string, { id: string; content: string; metadata?: MemoryMetadata }>()
    const edges: Array<{ src_id: string; dst_id: string; score: number }> = []

    const traverse = (memId: string, depth: number) => {
      if (depth === 0 || visited.has(memId)) return
      visited.add(memId)

      const mem = this.db
        .query<{ id: string; content: string; metadata: string | null }, [string]>(
          "SELECT id, content, metadata FROM memory WHERE id = ?"
        )
        .get(memId)
      if (!mem) return

      nodeMap.set(memId, {
        id: mem.id,
        content: mem.content,
        metadata: mem.metadata ? (JSON.parse(mem.metadata) as MemoryMetadata) : undefined,
      })

      const edgeRows = this.db
        .query<{ src_id: string; dst_id: string; score: number }, [string, string]>(
          "SELECT src_id, dst_id, score FROM memory_edge WHERE src_id = ? OR dst_id = ?"
        )
        .all(memId, memId)

      for (const edge of edgeRows) {
        const alreadyAdded = edges.some(
          (e) =>
            (e.src_id === edge.src_id && e.dst_id === edge.dst_id) ||
            (e.src_id === edge.dst_id && e.dst_id === edge.src_id)
        )
        if (!alreadyAdded) edges.push({ src_id: edge.src_id, dst_id: edge.dst_id, score: edge.score })
        traverse(edge.src_id === memId ? edge.dst_id : edge.src_id, depth - 1)
      }
    }

    traverse(input.memory_id, input.depth)
    return { nodes: Array.from(nodeMap.values()), edges }
  }

  forgetSession(input: ForgetSessionInput): { deleted_count: number } {
    const count = this.db
      .query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM memory WHERE session_id = ?")
      .get(input.session_id)
    this.db.run("DELETE FROM session WHERE id = ?", [input.session_id])
    return { deleted_count: count?.count ?? 0 }
  }

  stats(): MemoryStats {
    const memCount = this.db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM memory").get()
    const sessCount = this.db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM session").get()
    const edgeCount = this.db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM memory_edge").get()
    return {
      memory_count: memCount?.count ?? 0,
      session_count: sessCount?.count ?? 0,
      edge_count: edgeCount?.count ?? 0,
      db_size_bytes: getDbSize(this.db),
    }
  }

  close(): void {
    this.db.close()
  }
}
