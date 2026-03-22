export interface EmbeddingBackend {
    embed(text: string): Promise<number[]>;
}

export type BackendType = "ollama" | "openai";

let _backend: EmbeddingBackend | null = null;

export async function getEmbeddingBackend(): Promise<EmbeddingBackend> {
    if (_backend) return _backend;

    const type = (process.env.EMBEDDING_BACKEND ?? "ollama") as BackendType;

    if (type === "openai") {
        const { OpenAIBackend } = await import("./openai");
        _backend = new OpenAIBackend();
    } else {
        const { OllamaBackend } = await import("./ollama");
        _backend = new OllamaBackend();
    }

    return _backend;
}
