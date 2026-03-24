import type { Database } from "bun:sqlite"
import type { SearchMemoryInput, SearchResult, MemoryMetadata } from "../types"
import { getCandidates } from "./vector"

type FtsRow = { id: string; rank: number }

export function ftsSearch(db: Database, input: SearchMemoryInput): SearchResult[] {
  const candidates = getCandidates(db, input)
  if (candidates.length === 0) return []

  const candidateIds = candidates.map((c) => c.id)

  const ftsRows = db
    .query<FtsRow, [string]>(
      `SELECT m.id, bm25(memory_fts) as rank
       FROM memory_fts
       JOIN memory m ON m.rowid = memory_fts.rowid
       WHERE memory_fts MATCH ? AND m.project_id IS NOT NULL
       ORDER BY rank`
    )
    .all(sanitizeFtsQuery(input.query))

  const ranked = ftsRows
    .filter((r) => candidateIds.includes(r.id))
    .map((r) => ({ id: r.id, score: normalizeBm25(r.rank) }))
    .filter((r) => r.score >= input.min_score)
    .slice(0, input.limit)

  return ranked.map((r) => {
    const row = candidates.find((c) => c.id === r.id)!
    return {
      id: row.id,
      content: row.content,
      score: r.score,
      session_id: row.session_id,
      project_id: row.project_id,
      metadata: row.metadata ? (JSON.parse(row.metadata) as MemoryMetadata) : undefined,
    }
  })
}


function normalizeBm25(rank: number): number {
  // rank is <= 0, more negative = better
  // map to [0,1]: score = 1 / (1 + e^rank)  (rank <= 0 so e^rank <= 1, score >= 0.5)
  return 1 / (1 + Math.exp(rank))
}

function sanitizeFtsQuery(query: string): string {
  return query.replace(/["*^(){}[\]|]/g, " ").trim()
}
