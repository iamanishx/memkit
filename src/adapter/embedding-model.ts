import type {
    EmbeddingModelV3,
    EmbeddingModelV3CallOptions,
    EmbeddingModelV3Result,
} from "@ai-sdk/provider";
import {
    getEmbeddingBackend,
    type EmbeddingBackend,
} from "../embeddings/index";

export class MemoryEmbeddingModel implements EmbeddingModelV3 {
    readonly specificationVersion = "v3" as const;
    readonly provider = "code-memory";
    readonly modelId: string;
    readonly maxEmbeddingsPerCall = Infinity;
    readonly supportsParallelCalls = false;

    private backend: EmbeddingBackend;

    constructor(backend: EmbeddingBackend, modelId = "code-memory-embeddings") {
        this.backend = backend;
        this.modelId = modelId;
    }

    async doEmbed(
        options: EmbeddingModelV3CallOptions,
    ): Promise<EmbeddingModelV3Result> {
        const embeddings = await Promise.all(
            options.values.map((v) => this.backend.embed(v)),
        );

        return {
            embeddings,
            usage: { tokens: 0 },
            warnings: [],
        };
    }
}

export async function getMemoryEmbeddingModel(
    modelId?: string,
): Promise<MemoryEmbeddingModel> {
    const backend = await getEmbeddingBackend();
    return new MemoryEmbeddingModel(backend, modelId);
}
