import type { EmbeddingBackend } from "./index"

export class OllamaBackend implements EmbeddingBackend {
  private baseUrl: string
  private model: string

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
    this.model = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text"
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt: text }),
    })
    if (!res.ok) throw new Error(`Ollama embedding failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { embedding: number[] }
    return json.embedding
  }
}
