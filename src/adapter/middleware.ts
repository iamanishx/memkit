import type { LanguageModelMiddleware } from "ai";
import type {
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { addMemory, searchMemory } from "../memory";
import type { SearchResult } from "../types";

export interface MemoryMiddlewareConfig {
    projectId: string;
    sessionId: string;
    searchOptions?: {
        limit?: number;
        minScore?: number;
        expandGraph?: boolean;
    };
    autoStore?: boolean;
    autoRecall?: boolean;
    systemPromptTemplate?: (memories: SearchResult[]) => string;
}

function defaultSystemPromptTemplate(memories: SearchResult[]): string {
    if (memories.length === 0) return "";
    const items = memories.map((m, i) => `${i + 1}. ${m.content}`).join("\n");
    return `<memory>\nRelevant context from past interactions:\n${items}\n</memory>`;
}

function extractLastUserText(
    params: LanguageModelV3CallOptions,
): string | null {
    const prompt = params.prompt;
    for (let i = prompt.length - 1; i >= 0; i--) {
        const msg = prompt[i]!;
        if (msg.role === "user") {
            const textPart = msg.content.find((p) => p.type === "text");
            if (textPart && textPart.type === "text") return textPart.text;
        }
    }
    return null;
}

function injectMemoryIntoParams(
    params: LanguageModelV3CallOptions,
    memoryBlock: string,
): LanguageModelV3CallOptions {
    if (!memoryBlock) return params;

    const prompt = [...params.prompt];
    const systemIdx = prompt.findIndex((m) => m.role === "system");

    if (systemIdx !== -1) {
        const sys = prompt[systemIdx]!;
        if (sys.role === "system") {
            prompt[systemIdx] = {
                ...sys,
                content: `${sys.content}\n\n${memoryBlock}`,
            };
        }
    } else {
        prompt.unshift({ role: "system", content: memoryBlock });
    }

    return { ...params, prompt };
}

function extractAssistantText(
    result: LanguageModelV3GenerateResult,
): string | null {
    for (const part of result.content) {
        if (part.type === "text" && part.text.trim()) return part.text.trim();
    }
    return null;
}

export function memoryMiddleware(
    config: MemoryMiddlewareConfig,
): LanguageModelMiddleware {
    const {
        projectId,
        sessionId,
        searchOptions = {},
        autoStore = true,
        autoRecall = true,
        systemPromptTemplate = defaultSystemPromptTemplate,
    } = config;

    const limit = searchOptions.limit ?? 5;
    const minScore = searchOptions.minScore ?? 0.55;
    const expandGraph = searchOptions.expandGraph ?? false;

    return {
        specificationVersion: "v3",

        async transformParams({ params, type }) {
            if (!autoRecall) return params;

            const userText = extractLastUserText(params);
            if (!userText) return params;

            const memories = await searchMemory({
                query: userText,
                project_id: projectId,
                session_id: sessionId,
                limit,
                min_score: minScore,
                expand_graph: expandGraph,
            });

            if (memories.length === 0) return params;

            const memoryBlock = systemPromptTemplate(memories);
            return injectMemoryIntoParams(params, memoryBlock);
        },

        async wrapGenerate({ doGenerate, params }) {
            const result = await doGenerate();

            if (autoStore) {
                const assistantText = extractAssistantText(result);
                if (assistantText) {
                    await addMemory({
                        content: assistantText,
                        session_id: sessionId,
                        project_id: projectId,
                    }).catch(() => {});
                }
            }

            return result;
        },

        async wrapStream({ doStream, params }) {
            const result = await doStream();

            if (autoStore) {
                const originalStream = result.stream;
                let accumulated = "";

                const transformedStream = originalStream.pipeThrough(
                    new TransformStream<
                        Awaited<LanguageModelV3StreamResult>["stream"] extends ReadableStream<
                            infer T
                        >
                            ? T
                            : never,
                        Awaited<LanguageModelV3StreamResult>["stream"] extends ReadableStream<
                            infer T
                        >
                            ? T
                            : never
                    >({
                        transform(chunk, controller) {
                            if (chunk.type === "text-delta") {
                                accumulated += chunk.delta;
                            }
                            controller.enqueue(chunk);
                        },
                        async flush() {
                            if (accumulated.trim()) {
                                await addMemory({
                                    content: accumulated.trim(),
                                    session_id: sessionId,
                                    project_id: projectId,
                                }).catch(() => {});
                            }
                        },
                    }),
                );

                return { ...result, stream: transformedStream };
            }

            return result;
        },
    };
}
