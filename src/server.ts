import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import {
  addMemory,
  searchMemory,
  deleteMemory,
  listSessions,
  getGraph,
  forgetSession,
} from "./memory"
import {
  AddMemoryInputSchema,
  SearchMemoryInputSchema,
  DeleteMemoryInputSchema,
  ListSessionsInputSchema,
  GetGraphInputSchema,
  ForgetSessionInputSchema,
} from "./types"

function zodToJsonSchema(schema: z.ZodObject<any>): Record<string, any> {
  const shape = schema.shape
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const field = value as z.ZodTypeAny
    const isOptional = field instanceof z.ZodOptional || field instanceof z.ZodDefault
    const inner = isOptional
      ? field instanceof z.ZodOptional
        ? (field as z.ZodOptional<any>).unwrap()
        : (field as z.ZodDefault<any>)._def.innerType
      : field

    const prop: Record<string, any> = {}

    if (inner instanceof z.ZodString) prop.type = "string"
    else if (inner instanceof z.ZodNumber) prop.type = "number"
    else if (inner instanceof z.ZodBoolean) prop.type = "boolean"
    else if (inner instanceof z.ZodRecord) prop.type = "object"
    else prop.type = "string"

    const desc = (field as any)._def?.description
    if (desc) prop.description = desc

    if (field instanceof z.ZodDefault) {
      prop.default = (field as z.ZodDefault<any>)._def.defaultValue()
    }

    properties[key] = prop
    if (!isOptional) required.push(key)
  }

  return { type: "object", properties, required }
}

const server = new Server(
  { name: "code-memory", version: "0.1.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "add_memory",
      description: "Store a new memory with semantic embedding and graph linking",
      inputSchema: zodToJsonSchema(AddMemoryInputSchema),
    },
    {
      name: "search_memory",
      description: "Search memories by semantic similarity within a project",
      inputSchema: zodToJsonSchema(SearchMemoryInputSchema),
    },
    {
      name: "delete_memory",
      description: "Delete a memory by ID",
      inputSchema: zodToJsonSchema(DeleteMemoryInputSchema),
    },
    {
      name: "list_sessions",
      description: "List all sessions, optionally filtered by project ID",
      inputSchema: zodToJsonSchema(ListSessionsInputSchema),
    },
    {
      name: "get_graph",
      description: "Get the memory graph starting from a memory node up to a given depth",
      inputSchema: zodToJsonSchema(GetGraphInputSchema),
    },
    {
      name: "forget_session",
      description: "Delete all memories belonging to a session",
      inputSchema: zodToJsonSchema(ForgetSessionInputSchema),
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    if (name === "add_memory") {
      const input = AddMemoryInputSchema.parse(args)
      const result = await addMemory(input)
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      }
    }

    if (name === "search_memory") {
      const input = SearchMemoryInputSchema.parse(args)
      const results = await searchMemory(input)
      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      }
    }

    if (name === "delete_memory") {
      const input = DeleteMemoryInputSchema.parse(args)
      deleteMemory(input.id)
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      }
    }

    if (name === "list_sessions") {
      const input = ListSessionsInputSchema.parse(args)
      const sessions = listSessions(input)
      return {
        content: [{ type: "text", text: JSON.stringify(sessions) }],
      }
    }

    if (name === "get_graph") {
      const input = GetGraphInputSchema.parse(args)
      const graph = getGraph(input)
      return {
        content: [{ type: "text", text: JSON.stringify(graph) }],
      }
    }

    if (name === "forget_session") {
      const input = ForgetSessionInputSchema.parse(args)
      const result = forgetSession(input)
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
