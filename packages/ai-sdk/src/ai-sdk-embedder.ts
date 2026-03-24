import type { Embedder } from "@memkit/core"
import { embed } from "ai"
import type { EmbeddingModel } from "ai"

export class AiSdkEmbedder implements Embedder {
  readonly dimensions: number
  readonly modelId: string
  private model: EmbeddingModel

  constructor(model: EmbeddingModel, dimensions: number) {
    if (!dimensions || dimensions <= 0) {
      throw new Error("AiSdkEmbedder: dimensions must be a positive integer")
    }
    this.model = model
    this.dimensions = dimensions
    this.modelId = typeof model === "string" ? model : (model as any).modelId ?? "ai-sdk-embedding"
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({ model: this.model, value: text })
    const emb = result.embedding as number[]
    if (emb.length !== this.dimensions) {
      throw new Error(
        `AiSdkEmbedder: expected ${this.dimensions} dimensions but got ${emb.length}. ` +
          `Update the dimensions config to match your model.`
      )
    }
    return emb
  }
}
