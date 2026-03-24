import { tool } from "ai"
import type { MemoryEngine } from "@memkit/core"
import {
  AddMemoryInputSchema,
  SearchMemoryInputSchema,
  DeleteMemoryInputSchema,
  ListSessionsInputSchema,
  GetGraphInputSchema,
  ForgetSessionInputSchema,
} from "@memkit/core"

export function createMemoryTools(engine: MemoryEngine) {
  return {
    add_memory: tool({
      description: "Store a new memory with semantic embedding and graph linking",
      inputSchema: AddMemoryInputSchema,
      execute: async (input) => engine.add(input),
    }),
    search_memory: tool({
      description: "Search memories by semantic similarity within a project",
      inputSchema: SearchMemoryInputSchema,
      execute: async (input) => engine.search(input),
    }),
    delete_memory: tool({
      description: "Delete a memory by ID",
      inputSchema: DeleteMemoryInputSchema,
      execute: async (input) => {
        engine.delete(input.id)
        return { ok: true }
      },
    }),
    list_sessions: tool({
      description: "List all sessions, optionally filtered by project ID",
      inputSchema: ListSessionsInputSchema,
      execute: async (input) => engine.listSessions(input),
    }),
    get_graph: tool({
      description: "Get the memory graph starting from a memory node up to a given depth",
      inputSchema: GetGraphInputSchema,
      execute: async (input) => engine.getGraph(input),
    }),
    forget_session: tool({
      description: "Delete all memories belonging to a session",
      inputSchema: ForgetSessionInputSchema,
      execute: async (input) => engine.forgetSession(input),
    }),
  } as const
}
