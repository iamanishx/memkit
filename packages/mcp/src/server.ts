import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { MemoryEngine } from "@memkit/core"
import {
  AddMemoryInputSchema,
  SearchMemoryInputSchema,
  DeleteMemoryInputSchema,
  ListSessionsInputSchema,
  GetGraphInputSchema,
  ForgetSessionInputSchema,
} from "@memkit/core"
import { buildEngineConfigFromEnv } from "./env"
import { zodToJsonSchema } from "./zod-to-json"

export async function startServer() {
  const engine = new MemoryEngine(buildEngineConfigFromEnv())

  const server = new Server(
    { name: "memkit", version: "0.1.0" },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "add_memory", description: "Store a new memory with semantic embedding and graph linking", inputSchema: zodToJsonSchema(AddMemoryInputSchema) },
      { name: "search_memory", description: "Search memories by semantic similarity within a project", inputSchema: zodToJsonSchema(SearchMemoryInputSchema) },
      { name: "delete_memory", description: "Delete a memory by ID", inputSchema: zodToJsonSchema(DeleteMemoryInputSchema) },
      { name: "list_sessions", description: "List all sessions, optionally filtered by project ID", inputSchema: zodToJsonSchema(ListSessionsInputSchema) },
      { name: "get_graph", description: "Get the memory graph starting from a memory node up to a given depth", inputSchema: zodToJsonSchema(GetGraphInputSchema) },
      { name: "forget_session", description: "Delete all memories belonging to a session", inputSchema: zodToJsonSchema(ForgetSessionInputSchema) },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      if (name === "add_memory") {
        const input = AddMemoryInputSchema.parse(args)
        return { content: [{ type: "text", text: JSON.stringify(await engine.add(input)) }] }
      }
      if (name === "search_memory") {
        const input = SearchMemoryInputSchema.parse(args)
        return { content: [{ type: "text", text: JSON.stringify(await engine.search(input)) }] }
      }
      if (name === "delete_memory") {
        const input = DeleteMemoryInputSchema.parse(args)
        engine.delete(input.id)
        return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] }
      }
      if (name === "list_sessions") {
        const input = ListSessionsInputSchema.parse(args)
        return { content: [{ type: "text", text: JSON.stringify(engine.listSessions(input)) }] }
      }
      if (name === "get_graph") {
        const input = GetGraphInputSchema.parse(args)
        return { content: [{ type: "text", text: JSON.stringify(engine.getGraph(input)) }] }
      }
      if (name === "forget_session") {
        const input = ForgetSessionInputSchema.parse(args)
        return { content: [{ type: "text", text: JSON.stringify(engine.forgetSession(input)) }] }
      }
      return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true }
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
