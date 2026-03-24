import type { Database } from "bun:sqlite"
import { floatsToBlob, blobToFloats, cosineSimilarity } from "../db"
import type { Embedder } from "../embeddings/types"
import type { SearchMemoryInput, SearchResult, MemoryMetadata } from "../types"

type MemoryRow = {
  id: string
  content: string
  session_id: string
  project_id: string
  metadata: string | null
  embedding: Buffer
  dimensions: number | null
}

export async function vectorSearch(
  db: Database,
  input: SearchMemoryInput,
  embedder: Embedder,
  edgeThreshold: number,
  edgeTopK: number
): Promise<SearchResult[]> {
  const queryEmb = await embedder.embed(input.query)

  const candidates = getCandidates(db, input)

  for (const row of candidates) {
    if (row.embedding && row.dimensions !== null && row.dimensions !== embedder.dimensions) {
      throw new Error(
        `Dimension mismatch: stored memories use ${row.dimensions} dimensions but current embedder ` +
          `"${embedder.modelId}" produces ${embedder.dimensions}. Re-index or use the matching embedder.`
      )
    }
    break
  }

  const scored = candidates
    .filter((r) => r.embedding)
    .map((r) => ({
      ...r,
      score: cosineSimilarity(queryEmb, blobToFloats(r.embedding)),
    }))
    .filter((r) => r.score >= input.min_score)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit)

  const results: SearchResult[] = scored.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
    session_id: r.session_id,
    project_id: r.project_id,
    metadata: r.metadata ? (JSON.parse(r.metadata) as MemoryMetadata) : undefined,
  }))

  if (input.expand_graph && results.length > 0) {
    expandGraph(db, results)
  }

  return results
}

export function expandGraph(db: Database, results: SearchResult[]) {
  const topIds = results.map((r) => r.id)
  for (const result of results) {
    const edges = db
      .query<{ neighbor_id: string; score: number }, [string, string, string]>(
        `SELECT CASE WHEN src_id = ? THEN dst_id ELSE src_id END as neighbor_id, score
         FROM memory_edge WHERE src_id = ? OR dst_id = ?`
      )
      .all(result.id, result.id, result.id)

    const neighbors: { id: string; content: string; score: number }[] = []
    for (const edge of edges) {
      if (topIds.includes(edge.neighbor_id)) continue
      const mem = db
        .query<{ id: string; content: string }, [string]>("SELECT id, content FROM memory WHERE id = ?")
        .get(edge.neighbor_id)
      if (mem) neighbors.push({ id: mem.id, content: mem.content, score: edge.score })
    }
    if (neighbors.length > 0) result.neighbors = neighbors
  }
}

export function getCandidates(db: Database, input: SearchMemoryInput): MemoryRow[] {
  const windowSize = input.window_size
  if (input.session_id) {
    return db
      .query<MemoryRow, [string, string, number]>(
        `SELECT id, content, session_id, project_id, metadata, embedding, dimensions
         FROM memory WHERE project_id = ? AND session_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(input.project_id, input.session_id, windowSize)
  }
  return db
    .query<MemoryRow, [string, number]>(
      `SELECT id, content, session_id, project_id, metadata, embedding, dimensions
       FROM memory WHERE project_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(input.project_id, windowSize)
}
