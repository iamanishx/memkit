import type { Database } from "bun:sqlite"
import type { Embedder } from "../embeddings/types"
import type { SearchMemoryInput, SearchResult } from "../types"
import { vectorSearch } from "./vector"
import { ftsSearch } from "./fts"

export async function hybridSearch(
  db: Database,
  input: SearchMemoryInput,
  embedder: Embedder,
  edgeThreshold: number,
  edgeTopK: number,
  ftsWeight: number,
  vectorWeight: number
): Promise<SearchResult[]> {
  // run both in parallel
  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(db, input, embedder, edgeThreshold, edgeTopK),
    Promise.resolve(ftsSearch(db, input)),
  ])

  // merge by id, combine scores
  const scoreMap = new Map<string, { vectorScore: number; ftsScore: number }>()

  for (const r of vectorResults) {
    scoreMap.set(r.id, { vectorScore: r.score, ftsScore: 0 })
  }
  for (const r of ftsResults) {
    const existing = scoreMap.get(r.id)
    if (existing) {
      existing.ftsScore = r.score
    } else {
      scoreMap.set(r.id, { vectorScore: 0, ftsScore: r.score })
    }
  }

  // build combined result set — use vectorResults as the base for full metadata
  const allResults = new Map<string, SearchResult>()
  for (const r of [...vectorResults, ...ftsResults]) {
    if (!allResults.has(r.id)) allResults.set(r.id, { ...r })
  }

  const combined = Array.from(allResults.values())
    .map((r) => {
      const scores = scoreMap.get(r.id)!
      return {
        ...r,
        score: scores.vectorScore * vectorWeight + scores.ftsScore * ftsWeight,
      }
    })
    .filter((r) => r.score >= input.min_score)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit)

  return combined
}
