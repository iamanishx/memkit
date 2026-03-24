import { wrapLanguageModel } from "ai"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import type { EmbeddingModel } from "ai"
import { MemoryEngine } from "@memkit/core"
import type { MemoryEngineConfig, RetrievalMethod, SearchResult } from "@memkit/core"
import { AiSdkEmbedder } from "./ai-sdk-embedder"
import { createMemoryTools } from "./tools"
import { createMemoryMiddleware, type MemoryMiddlewareConfig } from "./middleware"
import { MemoryEmbeddingModel } from "./embedding-model"

export interface CreateMemoryConfig {
  projectId: string
  sessionId: string
  retrieval?: RetrievalMethod
  embeddingModel?: EmbeddingModel
  dimensions?: number
  dbPath?: string
  windowSize?: number
  searchLimit?: number
  edgeThreshold?: number
  edgeTopK?: number
  hybridFtsWeight?: number
  hybridVectorWeight?: number
  autoStore?: boolean
  autoRecall?: boolean
  systemPromptTemplate?: (memories: SearchResult[]) => string
}

export interface MemoryAdapter {
  tools: ReturnType<typeof createMemoryTools>
  middleware: ReturnType<typeof createMemoryMiddleware>
  embeddingModel: MemoryEmbeddingModel | null
  engine: MemoryEngine
  wrapModel: (model: LanguageModelV3) => LanguageModelV3
}

export function createMemory(config: CreateMemoryConfig): MemoryAdapter {
  const retrieval = config.retrieval ?? "vector"

  let embedder: AiSdkEmbedder | undefined
  if (config.embeddingModel && config.dimensions) {
    embedder = new AiSdkEmbedder(config.embeddingModel, config.dimensions)
  } else if (retrieval !== "fts") {
    throw new Error(
      `createMemory: retrieval="${retrieval}" requires embeddingModel and dimensions`
    )
  }

  const engineConfig: MemoryEngineConfig = {
    retrieval,
    embedder,
    dbPath: config.dbPath,
    windowSize: config.windowSize ?? 40,
    edgeThreshold: config.edgeThreshold,
    edgeTopK: config.edgeTopK,
    hybridFtsWeight: config.hybridFtsWeight,
    hybridVectorWeight: config.hybridVectorWeight,
  }

  const engine = new MemoryEngine(engineConfig)

  const middlewareConfig: MemoryMiddlewareConfig = {
    projectId: config.projectId,
    sessionId: config.sessionId,
    searchOptions: {
      limit: config.searchLimit ?? 10,
      windowSize: config.windowSize ?? 40,
    },
    autoStore: config.autoStore,
    autoRecall: config.autoRecall,
    systemPromptTemplate: config.systemPromptTemplate,
  }

  const middleware = createMemoryMiddleware(engine, middlewareConfig)
  const tools = createMemoryTools(engine)
  const embeddingModel = embedder ? new MemoryEmbeddingModel(embedder) : null

  return {
    tools,
    middleware,
    embeddingModel,
    engine,
    wrapModel(model: LanguageModelV3): LanguageModelV3 {
      return wrapLanguageModel({ model, middleware })
    },
  }
}
