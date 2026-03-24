import { OllamaEmbedder, OpenAIEmbedder } from "@memkit/core"
import type { MemoryEngineConfig, RetrievalMethod } from "@memkit/core"

export function buildEngineConfigFromEnv(): MemoryEngineConfig {
  const retrieval = parseRetrievalMethod(process.env.MEMKIT_RETRIEVAL)
  const dbPath = process.env.DB_PATH
  const windowSize = process.env.WINDOW_SIZE ? parseInt(process.env.WINDOW_SIZE, 10) : 40
  const edgeThreshold = process.env.EDGE_THRESHOLD ? parseFloat(process.env.EDGE_THRESHOLD) : 0.82
  const edgeTopK = process.env.EDGE_TOP_K ? parseInt(process.env.EDGE_TOP_K, 10) : 10

  if (retrieval === "fts") {
    return { retrieval, dbPath, windowSize, edgeThreshold, edgeTopK }
  }

  const backend = process.env.EMBEDDING_BACKEND ?? "ollama"

  if (backend === "openai") {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when EMBEDDING_BACKEND=openai")
    const dimensions = process.env.OPENAI_EMBED_DIMENSIONS
    if (!dimensions) throw new Error("OPENAI_EMBED_DIMENSIONS is required for vector/hybrid retrieval")
    return {
      retrieval,
      dbPath,
      windowSize,
      edgeThreshold,
      edgeTopK,
      embedder: new OpenAIEmbedder({
        apiKey,
        model: process.env.OPENAI_EMBED_MODEL,
        dimensions: parseInt(dimensions, 10),
      }),
    }
  }

  const dimensions = process.env.OLLAMA_EMBED_DIMENSIONS
  if (!dimensions) throw new Error("OLLAMA_EMBED_DIMENSIONS is required for vector/hybrid retrieval")
  return {
    retrieval,
    dbPath,
    windowSize,
    edgeThreshold,
    edgeTopK,
    embedder: new OllamaEmbedder({
      baseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_EMBED_MODEL,
      dimensions: parseInt(dimensions, 10),
    }),
  }
}

function parseRetrievalMethod(rawValue: string | undefined): RetrievalMethod {
  const value = rawValue ?? "vector"
  if (value === "vector" || value === "fts" || value === "hybrid") return value
  throw new Error(`MEMKIT_RETRIEVAL must be one of: vector, fts, hybrid. Received: ${value}`)
}
