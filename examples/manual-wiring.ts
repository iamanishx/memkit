import { MemoryEngine, OpenAIEmbedder } from "../packages/core/src/index";
import { createMemoryTools } from "../packages/ai-sdk/src/tools";
import { createMemoryMiddleware } from "../packages/ai-sdk/src/middleware";
import { wrapLanguageModel, streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";

const engine = new MemoryEngine({
    retrieval: "vector",
    embedder: new OpenAIEmbedder({
        apiKey: process.env.OPENAI_API_KEY!,
        model: "text-embedding-3-small",
        dimensions: 1536,
    }),
    windowSize: 40,
    edgeThreshold: 0.82,
});

const middleware = createMemoryMiddleware(engine, {
    projectId: "my-app",
    sessionId: "user-abc",
    autoStore: true,
    autoRecall: true,
    searchOptions: { limit: 5, windowSize: 40 },
});

const tools = createMemoryTools(engine);

const model = wrapLanguageModel({
    model: openai("gpt-4o-mini"),
    middleware,
});

const result = await streamText({
    model,
    tools,
    stopWhen: stepCountIs(10),
    prompt: "Remember that I prefer TypeScript over JavaScript.",
});

for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
}
console.log();

engine.close();
