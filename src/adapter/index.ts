export { createMemory, createMemoryAsync } from "./create-memory";
export type { CreateMemoryConfig, MemoryAdapter } from "./create-memory";

export {
    memoryTools,
    addMemoryTool,
    searchMemoryTool,
    deleteMemoryTool,
    listSessionsTool,
    getGraphTool,
    forgetSessionTool,
} from "./tools";

export { memoryMiddleware } from "./middleware";
export type { MemoryMiddlewareConfig } from "./middleware";

export {
    MemoryEmbeddingModel,
    getMemoryEmbeddingModel,
} from "./embedding-model";

// Re-export core types for consumers
export type {
    SearchResult,
    AddMemoryResult,
    Session,
    GraphResult,
    AddMemoryInput,
    SearchMemoryInput,
} from "../types";
