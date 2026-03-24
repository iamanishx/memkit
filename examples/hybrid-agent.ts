import { createMemory } from "../packages/ai-sdk/src/index";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";

const memory = createMemory({
    projectId: "my-app",
    sessionId: "user-abc",
    retrieval: "hybrid",
    embeddingModel: openai.embedding("text-embedding-3-small"),
    dimensions: 1536,
    hybridFtsWeight: 0.3,
    hybridVectorWeight: 0.7,
    windowSize: 40,
    searchLimit: 10,
});

const model = memory.wrapModel(openai("gpt-4o-mini"));

const result = await generateText({
    model,
    tools: { ...memory.tools },
    stopWhen: stepCountIs(10),
    prompt: "What do you remember about my editor preferences?",
});

console.log(result.text);
