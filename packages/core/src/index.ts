export { MemoryEngine } from "./engine"
export type { MemoryEngineConfig } from "./engine"

export type { Embedder } from "./embeddings/types"
export { OllamaEmbedder } from "./embeddings/ollama"
export { OpenAIEmbedder } from "./embeddings/openai"
export type { OllamaEmbedderConfig } from "./embeddings/ollama"
export type { OpenAIEmbedderConfig } from "./embeddings/openai"

export type {
  RetrievalMethod,
  Session,
  MemoryMetadata,
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
  MemoryStats,
} from "./types"

export {
  AddMemoryInputSchema,
  SearchMemoryInputSchema,
  DeleteMemoryInputSchema,
  ListSessionsInputSchema,
  GetGraphInputSchema,
  ForgetSessionInputSchema,
} from "./types"

export { floatsToBlob, blobToFloats, cosineSimilarity } from "./db"
