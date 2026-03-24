export interface Embedder {
  embed(text: string): Promise<number[]>
  readonly dimensions: number
  readonly modelId: string
}
