import { z } from "zod"

export const SessionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  label: z.string().optional(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type Session = z.infer<typeof SessionSchema>

export const MemoryMetadataSchema = z.record(z.string(), z.any())
export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>

export const MemorySchema = z.object({
  id: z.string(),
  session_id: z.string(),
  project_id: z.string(),
  content: z.string(),
  metadata: MemoryMetadataSchema.optional(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type Memory = z.infer<typeof MemorySchema>

export const MemoryEdgeSchema = z.object({
  id: z.string(),
  src_id: z.string(),
  dst_id: z.string(),
  score: z.number(),
  created_at: z.number(),
})
export type MemoryEdge = z.infer<typeof MemoryEdgeSchema>

export const AddMemoryInputSchema = z.object({
  content: z.string().describe("The text content to remember"),
  session_id: z.string().describe("Session ID this memory belongs to"),
  project_id: z.string().describe("Project ID to scope memory linking"),
  metadata: MemoryMetadataSchema.optional().describe("Optional JSON metadata"),
})
export type AddMemoryInput = z.infer<typeof AddMemoryInputSchema>

export const SearchMemoryInputSchema = z.object({
  query: z.string().describe("Natural language query to search memories"),
  project_id: z.string().describe("Project ID to search within"),
  session_id: z.string().optional().describe("Optionally restrict to a specific session"),
  limit: z.number().int().min(1).max(50).default(10).describe("Max results to return"),
  min_score: z.number().min(0).max(1).default(0.5).describe("Minimum cosine similarity threshold"),
  expand_graph: z.boolean().default(false).describe("Also return 1-hop graph neighbors of top results"),
})
export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>

export const DeleteMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to delete"),
})
export type DeleteMemoryInput = z.infer<typeof DeleteMemoryInputSchema>

export const ListSessionsInputSchema = z.object({
  project_id: z.string().optional().describe("Filter sessions by project ID"),
})
export type ListSessionsInput = z.infer<typeof ListSessionsInputSchema>

export const GetGraphInputSchema = z.object({
  memory_id: z.string().describe("Memory ID to get graph for"),
  depth: z.number().int().min(1).max(4).default(2).describe("Number of hops to traverse"),
})
export type GetGraphInput = z.infer<typeof GetGraphInputSchema>

export const ForgetSessionInputSchema = z.object({
  session_id: z.string().describe("Session ID whose memories to delete"),
})
export type ForgetSessionInput = z.infer<typeof ForgetSessionInputSchema>

export const EnsureSessionInputSchema = z.object({
  session_id: z.string(),
  project_id: z.string(),
  label: z.string().optional(),
})
export type EnsureSessionInput = z.infer<typeof EnsureSessionInputSchema>

export interface AddMemoryResult {
  id: string
  linked_count: number
}

export interface SearchResult {
  id: string
  content: string
  score: number
  session_id: string
  project_id: string
  metadata?: MemoryMetadata
  neighbors?: Array<{ id: string; content: string; score: number }>
}

export interface GraphResult {
  nodes: Array<{ id: string; content: string; metadata?: MemoryMetadata }>
  edges: Array<{ src_id: string; dst_id: string; score: number }>
}
