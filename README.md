# freememory-lite

A dead simple, fully local memory layer for AI agents. It runs as an MCP server over stdio so any AI SDK, OpenCode, Claude Desktop, or anything that speaks MCP can plug in and get persistent memory.

Your AI remembers things. Across sessions. Across projects. Without sending anything to the cloud (unless you want it to).

## What it does

Every time your AI learns something worth keeping, it calls `add_memory`. That memory gets embedded into a vector, stored in a local SQLite database, and automatically linked to similar memories in the same project through a lightweight graph.

When the AI needs to recall something, it calls `search_memory`. Semantic search finds the closest matches, and optionally walks the graph one hop out to surface related context the AI might not have thought to ask for.

That's it. Three tables. Six tools. One SQLite file on your disk.

## Why this exists

Most memory solutions want you to use their cloud. Or they need you to run Postgres with pgvector. Or they pull in 400MB of Python dependencies.

This is the opposite. It's a single bun process that talks stdio. It stores everything in `~/.freememory/memory.db`. You can back it up by copying a file. You can delete it by deleting a file. You own your data because it literally never leaves your machine.

## How it works

```
Your AI agent
    |
    | stdio (JSON-RPC)
    v
freememory-lite (MCP server)
    |
    |--- Embedding Backend (ollama / openai)
    |
    |--- SQLite
           |-- session (groups memories by project)
           |-- memory (content + embedding blob)
           |-- memory_edge (similarity links between memories)
```

When you add a memory:
1. The text gets embedded via your chosen backend (ollama by default, openai if you prefer)
2. It's inserted into SQLite with the embedding stored as a raw float32 blob
3. A similarity scan runs against all other memories in the same project
4. Any pair above the threshold (default 0.82 cosine similarity) gets a graph edge

When you search:
1. Your query gets embedded
2. Cosine similarity is computed against all project memories
3. Results are ranked and filtered by your minimum score
4. If `expand_graph` is on, neighbors of top results are pulled in and re-ranked

## Getting started

### Prerequisites

You need [bun](https://bun.sh) and an embedding backend. The easiest local option is [ollama](https://ollama.ai):

```bash
# install ollama if you haven't
curl -fsSL https://ollama.ai/install.sh | sh

# pull an embedding model
ollama pull nomic-embed-text
```

### Install and run

```bash
git clone https://github.com/xmanish/freememory-lite.git
cd freememory-lite
bun install
```

To run the MCP server:

```bash
bun run start
```

That starts the stdio server. It doesn't print anything to stdout on its own because it speaks JSON-RPC over stdin/stdout. You connect it from your MCP client.

### Configuration

Everything is controlled by environment variables. Defaults work out of the box if you have ollama running:

```bash
# which backend to use for embeddings ("ollama" or "openai")
EMBEDDING_BACKEND=ollama

# ollama settings
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# openai settings (only needed if EMBEDDING_BACKEND=openai)
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small

# where to store the database
DB_PATH=~/.freememory/memory.db

# graph linking
EDGE_THRESHOLD=0.82
EDGE_TOP_K=10
```

## Tools

The server exposes six tools over MCP:

### add_memory

Store something the AI should remember.

```json
{
  "name": "add_memory",
  "arguments": {
    "content": "The user prefers dark mode and uses vim keybindings",
    "session_id": "sess_abc123",
    "project_id": "proj_myapp",
    "metadata": { "source": "user_preference", "tags": ["ui", "editor"] }
  }
}
```

Returns `{ "id": "mem_...", "linked_count": 3 }` telling you how many existing memories got linked.

### search_memory

Find relevant memories by meaning, not keywords.

```json
{
  "name": "search_memory",
  "arguments": {
    "query": "what editor settings does the user like",
    "project_id": "proj_myapp",
    "limit": 5,
    "min_score": 0.6,
    "expand_graph": true
  }
}
```

Returns ranked results with scores. When `expand_graph` is true, you also get `neighbors` on each result showing related memories one hop away in the graph.

### get_graph

Explore the memory graph starting from any node.

```json
{
  "name": "get_graph",
  "arguments": {
    "memory_id": "mem_abc123",
    "depth": 2
  }
}
```

Returns `{ "nodes": [...], "edges": [...] }` so you can see how memories cluster together.

### delete_memory

Remove a specific memory.

```json
{
  "name": "delete_memory",
  "arguments": { "id": "mem_abc123" }
}
```

### list_sessions

See all sessions, optionally filtered by project.

```json
{
  "name": "list_sessions",
  "arguments": { "project_id": "proj_myapp" }
}
```

### forget_session

Delete all memories for a session. Clean slate.

```json
{
  "name": "forget_session",
  "arguments": { "session_id": "sess_abc123" }
}
```

## Using with AI SDK

### MCP client config

```typescript
// mcp.config.ts
export default {
  servers: {
    memory: {
      command: "bun",
      args: ["run", "/path/to/freememory-lite/src/server.ts"],
      env: {
        EMBEDDING_BACKEND: "ollama",
        DB_PATH: "~/.freememory/memory.db"
      }
    }
  }
}
```

### In your assistant

```typescript
import { streamText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { experimental_createMCPClient } from "ai"

const mcp = await experimental_createMCPClient({
  transport: {
    type: "stdio",
    command: "bun",
    args: ["run", "/path/to/freememory-lite/src/server.ts"],
  },
})

const tools = await mcp.tools()

const result = await streamText({
  model: anthropic("claude-sonnet-4-5"),
  tools,
  messages,
  system: `You have persistent memory. Use add_memory to remember important context.
  Use search_memory before answering questions that might benefit from past context.
  Use get_graph when you need to understand how topics relate to each other.`,
})
```

### With Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "memory": {
      "command": "bun",
      "args": ["run", "/path/to/freememory-lite/src/server.ts"],
      "env": {
        "EMBEDDING_BACKEND": "ollama"
      }
    }
  }
}
```

### With OpenCode

Add to your `.opencode/config.json`:

```json
{
  "mcp": {
    "memory": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/freememory-lite/src/server.ts"],
      "env": {
        "EMBEDDING_BACKEND": "ollama"
      }
    }
  }
}
```

## How the graph works

The graph is the thing that makes this more useful than a plain vector store. When you add a memory, it doesn't just sit in a table. It gets compared against every other memory in the project, and any pair with similarity above the threshold gets linked.

```
"user likes dark mode" ----0.91---- "prefers dark themes in all apps"
                           |
                         0.85
                           |
                  "UI should default to dark"
```

This means when you search for something and find one memory, you can walk the graph to find things that are related but might not match the exact query. A search for "theme preferences" might directly hit "user likes dark mode", and the graph expansion pulls in "UI should default to dark" even if that memory's embedding isn't a top match for the query.

## The database

Everything lives in one SQLite file. Three tables:

**session** - Groups memories by project. A session belongs to exactly one project.

**memory** - The actual content. Each row has the text, JSON metadata, and the embedding as a raw blob. The `project_id` is denormalized from the session for fast scoped queries.

**memory_edge** - Similarity links. Each edge stores the cosine similarity score. Stored as `(src, dst)` but queried bidirectionally.

Cascading deletes mean if you delete a session, all its memories and their edges go with it.

## Project structure

```
freememory-lite/
  src/
    server.ts           MCP stdio server, tool routing
    memory.ts           core logic: add, search, graph traversal
    db.ts               SQLite setup, migrations, cosine similarity
    types.ts            zod schemas for all inputs and outputs
    embeddings/
      index.ts          backend factory
      ollama.ts         ollama embedding client
      openai.ts         openai embedding client
      local.ts          local CPU embeddings (WIP)
  package.json
  tsconfig.json
  README.md
```

## Current status

This is early. The core loop works: add memories, search them, traverse the graph. The ollama and openai embedding backends work. The local CPU embedding backend (via transformers.js) is WIP due to native dependency issues with bun.

Things that are coming:
- Local CPU embedding support (looking at custom HuggingFace models)
- Memory compaction (summarize old memories to save space)
- TTL / expiry on memories
- Better graph algorithms (PageRank-style importance scoring)
- npm package for `npx freememory-lite`

## License

MIT
