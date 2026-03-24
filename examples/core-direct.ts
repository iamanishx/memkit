import { MemoryEngine, OllamaEmbedder } from "../packages/core/src/index";

const engine = new MemoryEngine({
    retrieval: "vector",
    embedder: new OllamaEmbedder({
        model: "nomic-embed-text",
        dimensions: 768,
    }),
    windowSize: 40,
});

const { id } = await engine.add({
    content: "User prefers dark mode and uses neovim",
    session_id: "sess-1",
    project_id: "my-app",
});

console.log("stored:", id);

const results = await engine.search({
    query: "editor preferences",
    project_id: "my-app",
    limit: 5,
    window_size: 40,
    min_score: 0.5,
    expand_graph: false,
});

console.log("results:", results);

const stats = engine.stats();
console.log("stats:", stats);

engine.close();
