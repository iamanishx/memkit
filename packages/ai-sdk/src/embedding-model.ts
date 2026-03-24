import type { EmbeddingModelV3, EmbeddingModelV3CallOptions, EmbeddingModelV3Result } from "@ai-sdk/provider"
import type { Embedder } from "@memkit/core"

export class MemoryEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = "v3" as const
  readonly provider = "memkit"
  readonly modelId: string
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = false

  private embedder: Embedder

  constructor(embedder: Embedder) {
    this.embedder = embedder
    this.modelId = embedder.modelId
  }

  async doEmbed(options: EmbeddingModelV3CallOptions): Promise<EmbeddingModelV3Result> {
    const embeddings = await Promise.all(options.values.map((v: string) => this.embedder.embed(v)))
    return { embeddings, usage: { tokens: 0 }, warnings: [] }
  }
}
