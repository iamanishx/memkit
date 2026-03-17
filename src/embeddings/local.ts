import type { EmbeddingBackend } from "./index"

export class LocalBackend implements EmbeddingBackend {
  private pipeline: any = null

  private async getPipeline() {
    if (this.pipeline) return this.pipeline
    const { pipeline, env } = await import("@xenova/transformers")
    env.allowLocalModels = false
    env.backends.onnx.wasm.proxy = false
    const model = process.env.EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2"
    this.pipeline = await pipeline("feature-extraction", model, { revision: "main" })
    return this.pipeline
  }

  async embed(text: string): Promise<number[]> {
    const pipe = await this.getPipeline()
    const output = await pipe(text, { pooling: "mean", normalize: true })
    return Array.from(output.data as Float32Array)
  }
}
