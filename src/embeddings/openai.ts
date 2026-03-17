import type { EmbeddingBackend } from "./index"

export class OpenAIBackend implements EmbeddingBackend {
  private apiKey: string
  private model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? ""
    this.model = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small"
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is required for openai embedding backend")
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    })
    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> }
    return json.data[0]!.embedding
  }
}
