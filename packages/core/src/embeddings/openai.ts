import type { Embedder } from "./types"

export interface OpenAIEmbedderConfig {
  apiKey: string
  dimensions: number
  model?: string
}

export class OpenAIEmbedder implements Embedder {
  readonly dimensions: number
  readonly modelId: string
  private apiKey: string

  constructor(config: OpenAIEmbedderConfig) {
    if (!config.apiKey) throw new Error("OpenAIEmbedder: apiKey is required")
    this.apiKey = config.apiKey
    this.dimensions = config.dimensions
    this.modelId = config.model ?? "text-embedding-3-small"
  }

  async embed(text: string): Promise<number[]> {
    const body: { model: string; input: string; dimensions?: number } = {
      model: this.modelId,
      input: text,
    }
    if (this.modelId.startsWith("text-embedding-3")) {
      body.dimensions = this.dimensions
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> }
    const emb = json.data[0]!.embedding
    if (emb.length !== this.dimensions) {
      throw new Error(
        `OpenAIEmbedder: expected ${this.dimensions} dimensions but got ${emb.length}. ` +
          `Check your model or update the dimensions config.`
      )
    }
    return emb
  }
}
