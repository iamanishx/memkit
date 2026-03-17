export interface EmbeddingBackend {
  embed(text: string): Promise<number[]>
}

export type BackendType = "local" | "ollama" | "openai"

let _backend: EmbeddingBackend | null = null

export async function getEmbeddingBackend(): Promise<EmbeddingBackend> {
  if (_backend) return _backend

  const type = (process.env.EMBEDDING_BACKEND ?? "local") as BackendType

  if (type === "ollama") {
    const { OllamaBackend } = await import("./ollama")
    _backend = new OllamaBackend()
  } else if (type === "openai") {
    const { OpenAIBackend } = await import("./openai")
    _backend = new OpenAIBackend()
  } else {
    const { LocalBackend } = await import("./local")
    _backend = new LocalBackend()
  }

  return _backend
}
