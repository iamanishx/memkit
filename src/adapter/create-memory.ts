import { wrapLanguageModel } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { memoryTools, type memoryTools as MemoryToolsType } from "./tools";
import { memoryMiddleware, type MemoryMiddlewareConfig } from "./middleware";
import {
    getMemoryEmbeddingModel,
    type MemoryEmbeddingModel,
} from "./embedding-model";

export interface CreateMemoryConfig {
    projectId: string;
    sessionId: string;
    searchOptions?: MemoryMiddlewareConfig["searchOptions"];
    autoStore?: boolean;
    autoRecall?: boolean;
    systemPromptTemplate?: MemoryMiddlewareConfig["systemPromptTemplate"];
}

export interface MemoryAdapter {
    tools: typeof MemoryToolsType;
    middleware: ReturnType<typeof memoryMiddleware>;
    embeddingModel: MemoryEmbeddingModel | null;
    wrapModel: (model: LanguageModelV3) => LanguageModelV3;
}

export function createMemory(config: CreateMemoryConfig): MemoryAdapter {
    const middleware = memoryMiddleware({
        projectId: config.projectId,
        sessionId: config.sessionId,
        searchOptions: config.searchOptions,
        autoStore: config.autoStore,
        autoRecall: config.autoRecall,
        systemPromptTemplate: config.systemPromptTemplate,
    });

    return {
        tools: memoryTools,
        middleware,
        embeddingModel: null,

        wrapModel(model: LanguageModelV3): LanguageModelV3 {
            return wrapLanguageModel({ model, middleware });
        },
    };
}

export async function createMemoryAsync(
    config: CreateMemoryConfig,
): Promise<MemoryAdapter & { embeddingModel: MemoryEmbeddingModel }> {
    const middleware = memoryMiddleware({
        projectId: config.projectId,
        sessionId: config.sessionId,
        searchOptions: config.searchOptions,
        autoStore: config.autoStore,
        autoRecall: config.autoRecall,
        systemPromptTemplate: config.systemPromptTemplate,
    });

    const embeddingModel = await getMemoryEmbeddingModel();

    return {
        tools: memoryTools,
        middleware,
        embeddingModel,

        wrapModel(model: LanguageModelV3): LanguageModelV3 {
            return wrapLanguageModel({ model, middleware });
        },
    };
}
