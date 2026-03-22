# memkit

A fully local, persistent memory layer for AI agents. Runs as an **MCP server over stdio** for Claude Desktop, OpenCode, and any MCP client — and also ships a **native AI SDK adapter** so you can drop it directly into any `generateText` / `streamText` agent without any MCP wiring.

Your AI remembers things. Across sessions. Across projects. Without sending anything to the cloud (unless you want it to).

## What it does

Every time your AI learns something worth keeping, it calls `add_memory`. That memory gets embedded into a vector, stored in a local SQLite database, and automatically linked to similar memories in the same project through a lightweight graph.

When the AI needs to recall something, it calls `search_memory`. Semantic search finds the closest matches, and optionally walks the graph one hop out to surface related context the AI might not have thought to ask for.

Three tables. Six tools. One SQLite file on your disk.

## How it works

```
Your AI agent
    |
    |--- AI SDK adapter (import "code-memory/adapter")
    |         |
    |         |-- memoryTools       injected into generateText/streamText
    |         |-- memoryMiddleware  auto recall + auto store via wrapLanguageModel
    |         |-- MemoryEmbeddingModel  AI SDK-compatible EmbeddingModelV3
    |
    |--- MCP stdio server (bun run start)
    |         |
    |         | stdio (JSON-RPC)
    |
    |--- Embedding Backend (ollama / openai)
    |
    |--- SQLite
           |-- session
           |-- memory (content + embedding blob)
           |-- memory_edge (similarity links)
```

When you add a memory:
1. Text gets embedded via your chosen backend
2. Inserted into SQLite with the embedding as a raw float32 blob
3. Similarity scan runs against all memories in the same project
4. Any pair above the threshold (default 0.82 cosine similarity) gets a graph edge

When you search:
1. Query gets embedded
2. Cosine similarity computed against all project memories
3. Results ranked and filtered by minimum score
4. If `expand_graph` is on, neighbors of top results are pulled in

---

## AI SDK Adapter

This is the recommended way to use `code-memory` when building agents with the Vercel AI SDK. No MCP client, no subprocess, no boilerplate — just import and go.

### Install

```bash
bun add memkit ai
# or
npm install memkit ai
```

Set your embedding backend env vars (see Configuration below), then:

### `createMemory` — one call setup

```typescript
import { createMemory } from "memkit/adapter"
import { streamText, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"

const memory = createMemory({
  projectId: "my-app",
  sessionId: "user-abc",
})

// Wrap your model — auto recall before generation, auto store after
const model = memory.wrapModel(openai("gpt-4o"))

const result = await streamText({
  model,
  tools: { ...memory.tools },
  stopWhen: stepCountIs(10),
  messages,
})
```

That's it. Every call to `streamText` or `generateText` will:
- Search for relevant past memories and inject them into the system prompt
- Store the assistant's response as a new memory after generation

### `memoryMiddleware` — manual control

If you want to wire the middleware yourself via `wrapLanguageModel`:

```typescript
import { wrapLanguageModel, streamText } from "ai"
import { memoryMiddleware } from "memkit/adapter"
import { anthropic } from "@ai-sdk/anthropic"

const model = wrapLanguageModel({
  model: anthropic("claude-sonnet-4-5"),
  middleware: memoryMiddleware({
    projectId: "my-app",
    sessionId: "user-abc",
    searchOptions: {
      limit: 5,         // top memories to inject (default: 5)
      minScore: 0.55,   // similarity threshold (default: 0.55)
      expandGraph: true // pull in graph neighbors (default: false)
    },
    autoRecall: true,   // inject memories before generation (default: true)
    autoStore: true,    // store assistant replies after generation (default: true)
    // optional: customize the memory block injected into the system prompt
    systemPromptTemplate: (memories) =>
      `<memory>\n${memories.map(m => m.content).join("\n")}\n</memory>`,
  }),
})

const result = await streamText({ model, messages })
```

### `memoryTools` — explicit tool use

Give the model direct control over memory. Useful when you want the model to decide what to remember rather than auto-storing everything.

```typescript
import { generateText, stepCountIs } from "ai"
import { memoryTools } from "memkit/adapter"
import { openai } from "@ai-sdk/openai"

const result = await generateText({
  model: openai("gpt-4o"),
  tools: { ...memoryTools },
  stopWhen: stepCountIs(10),
  system: `You have persistent memory. Use add_memory to store important context.
Use search_memory before answering questions that might benefit from past context.`,
  messages,
})
```

Available tools: `add_memory`, `search_memory`, `delete_memory`, `list_sessions`, `get_graph`, `forget_session`.

### `createMemoryAsync` — with embedding model

If you also need the `EmbeddingModel` (for `embed()` / `embedMany()` calls), use the async factory:

```typescript
import { createMemoryAsync } from "memkit/adapter"
import { embed } from "ai"

const memory = await createMemoryAsync({
  projectId: "my-app",
  sessionId: "user-abc",
})

// memory.embeddingModel is a fully typed EmbeddingModelV3
const { embedding } = await embed({
  model: memory.embeddingModel,
  value: "some text to embed",
})
```

### Adapter API reference

| Export | Type | Description |
|---|---|---|
| `createMemory(config)` | sync | Returns `{ tools, middleware, wrapModel }` |
| `createMemoryAsync(config)` | async | Same + `embeddingModel` resolved |
| `memoryTools` | object | All 6 tools as a named map, spread into `tools` |
| `memoryMiddleware(config)` | function | `LanguageModelMiddleware` for `wrapLanguageModel` |
| `getMemoryEmbeddingModel()` | async | Returns a `MemoryEmbeddingModel` (EmbeddingModelV3) |
| `MemoryEmbeddingModel` | class | AI SDK-compatible embedding model class |

`CreateMemoryConfig`:

```typescript
{
  projectId: string
  sessionId: string
  searchOptions?: {
    limit?: number       // default 5
    minScore?: number    // default 0.55
    expandGraph?: boolean // default false
  }
  autoStore?: boolean    // default true
  autoRecall?: boolean   // default true
  systemPromptTemplate?: (memories: SearchResult[]) => string
}
```

---

## MCP Server

The stdio MCP server works unchanged for non-AI-SDK consumers.

### Getting started

You need [bun](https://bun.sh) and an embedding backend. The easiest local option is [ollama](https://ollama.ai):

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull nomic-embed-text
```

```bash
git clone https://github.com/xmanish/memkit.git
cd memkit
bun install
bun run start
```

### With Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS:

```json
{
  "mcpServers": {
    "memory": {
      "command": "bun",
      "args": ["run", "/path/to/memkit/src/server.ts"],
      "env": {
        "EMBEDDING_BACKEND": "ollama"
      }
    }
  }
}
```

### With OpenCode

Add to `.opencode/config.json`:

```json
{
  "mcp": {
    "memory": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/code-memory/src/server.ts"],
      "env": {
        "EMBEDDING_BACKEND": "ollama"
      }
    }
  }
}
```

### Via AI SDK MCP client

```typescript
import { streamText, experimental_createMCPClient } from "ai"

const mcp = await experimental_createMCPClient({
  transport: {
    type: "stdio",
    command: "bun",
    args: ["run", "/path/to/code-memory/src/server.ts"],
  },
})

const tools = await mcp.tools()

const result = await streamText({
  model: "anthropic/claude-sonnet-4-5",
  tools,
  messages,
  system: `You have persistent memory. Use add_memory to store important context.
Use search_memory before answering questions that benefit from past context.`,
})
```

---

## Configuration

All configuration is via environment variables:

```bash
# embedding backend: "ollama" (default) or "openai"
EMBEDDING_BACKEND=ollama

# ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# openai (only needed if EMBEDDING_BACKEND=openai)
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small

# database location
DB_PATH=~/.memkit/memory.db

# graph linking
EDGE_THRESHOLD=0.82
EDGE_TOP_K=10
```

---

## Tools reference

### `add_memory`

Store something the AI should remember.

```json
{
  "content": "The user prefers dark mode and uses vim keybindings",
  "session_id": "sess_abc123",
  "project_id": "proj_myapp",
  "metadata": { "source": "user_preference" }
}
```

Returns `{ "id": "mem_...", "linked_count": 3 }`.

### `search_memory`

Find relevant memories by meaning.

```json
{
  "query": "what editor settings does the user like",
  "project_id": "proj_myapp",
  "limit": 5,
  "min_score": 0.6,
  "expand_graph": true
}
```

### `get_graph`

Traverse the memory graph from any node.

```json
{ "memory_id": "mem_abc123", "depth": 2 }
```

Returns `{ "nodes": [...], "edges": [...] }`.

### `delete_memory`

```json
{ "id": "mem_abc123" }
```

### `list_sessions`

```json
{ "project_id": "proj_myapp" }
```

### `forget_session`

Delete all memories for a session.

```json
{ "session_id": "sess_abc123" }
```

---

## How the graph works

When you add a memory it doesn't just sit in a table. It gets compared against every other memory in the project and any pair with similarity above the threshold gets linked.

```
"user likes dark mode" ----0.91---- "prefers dark themes in all apps"
                           |
                         0.85
                           |
                  "UI should default to dark"
```

A search for "theme preferences" might directly hit "user likes dark mode", and graph expansion pulls in "UI should default to dark" even if that memory's embedding isn't a top match for the query.

---

## Project structure

```
code-memory/
  src/
    server.ts              MCP stdio server, tool routing
    memory.ts              core logic: add, search, graph traversal
    db.ts                  SQLite setup, migrations, cosine similarity
    types.ts               zod schemas for all inputs and outputs
    embeddings/
      index.ts             backend factory (ollama | openai)
      ollama.ts            ollama embedding client
      openai.ts            openai embedding client
    adapter/               AI SDK integration layer
      index.ts             public exports
      tools.ts             AI SDK tool() definitions
      middleware.ts        LanguageModelMiddleware — auto recall + store
      embedding-model.ts   EmbeddingModelV3 adapter
      create-memory.ts     createMemory() / createMemoryAsync() factories
  package.json
  tsconfig.json
  README.md
```

---

## Roadmap

- Memory compaction (summarize old memories to save space)
- TTL / expiry on memories
- Better graph algorithms (PageRank-style importance scoring)
- npm package

## License

MIT
