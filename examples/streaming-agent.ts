import { createMemory } from "../packages/ai-sdk/src/index";
import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";

const memory = createMemory({
    projectId: "my-app",
    sessionId: "user-abc",
    retrieval: "vector",
    embeddingModel: openai.embedding("text-embedding-3-small"),
    dimensions: 1536,
    autoStore: true,
    autoRecall: true,
});

const model = memory.wrapModel(openai("gpt-4o-mini"));

const messages = [
    { role: "user" as const, content: "I prefer dark mode and use neovim." },
];

const result = await streamText({
    model,
    tools: { ...memory.tools },
    stopWhen: stepCountIs(10),
    messages,
});

for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
}
console.log();
