export { createMemory } from "./create-memory"
export type { CreateMemoryConfig, MemoryAdapter } from "./create-memory"

export { createMemoryTools } from "./tools"
export { createMemoryMiddleware } from "./middleware"
export type { MemoryMiddlewareConfig } from "./middleware"
export { AiSdkEmbedder } from "./ai-sdk-embedder"
export { MemoryEmbeddingModel } from "./embedding-model"

export type {
  SearchResult,
  AddMemoryResult,
  Session,
  GraphResult,
  AddMemoryInput,
  SearchMemoryInput,
  RetrievalMethod,
  MemoryStats,
} from "@memkit/core"
