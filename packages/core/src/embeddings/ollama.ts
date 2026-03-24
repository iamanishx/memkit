import type { Embedder } from "./types"

export interface OllamaEmbedderConfig {
  dimensions: number
  baseUrl?: string
  model?: string
}

export class OllamaEmbedder implements Embedder {
  readonly dimensions: number
  readonly modelId: string
  private baseUrl: string

  constructor(config: OllamaEmbedderConfig) {
    this.dimensions = config.dimensions
    this.baseUrl = config.baseUrl ?? "http://localhost:11434"
    this.modelId = config.model ?? "nomic-embed-text"
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.modelId, prompt: text }),
    })
    if (!res.ok) throw new Error(`Ollama embedding failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { embedding: number[] }
    const emb = json.embedding
    if (emb.length !== this.dimensions) {
      throw new Error(
        `OllamaEmbedder: expected ${this.dimensions} dimensions but got ${emb.length}. ` +
          `Check your model or update the dimensions config.`
      )
    }
    return emb
  }
}
