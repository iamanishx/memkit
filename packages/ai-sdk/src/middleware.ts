import type { LanguageModelMiddleware } from "ai"
import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult, LanguageModelV3StreamResult } from "@ai-sdk/provider"
import type { MemoryEngine, SearchResult } from "@memkit/core"

export interface MemoryMiddlewareConfig {
  projectId: string
  sessionId: string
  searchOptions?: {
    limit?: number
    minScore?: number
    windowSize?: number
    expandGraph?: boolean
  }
  autoStore?: boolean
  autoRecall?: boolean
  systemPromptTemplate?: (memories: SearchResult[]) => string
}

function defaultSystemPromptTemplate(memories: SearchResult[]): string {
  if (memories.length === 0) return ""
  const items = memories.map((m, i) => `${i + 1}. ${m.content}`).join("\n")
  return `<memory>\nRelevant context from past interactions:\n${items}\n</memory>`
}

function extractLastUserText(params: LanguageModelV3CallOptions): string | null {
  for (let i = params.prompt.length - 1; i >= 0; i--) {
    const msg = params.prompt[i]!
    if (msg.role === "user") {
      const textPart = msg.content.find((p: { type: string }) => p.type === "text")
      if (textPart && (textPart as { type: string; text: string }).type === "text") return (textPart as { type: string; text: string }).text
    }
  }
  return null
}

function injectMemory(params: LanguageModelV3CallOptions, block: string): LanguageModelV3CallOptions {
  if (!block) return params
  const prompt = [...params.prompt]
  const sysIdx = prompt.findIndex((m) => m.role === "system")
  if (sysIdx !== -1) {
    const sys = prompt[sysIdx]!
    if (sys.role === "system") {
      prompt[sysIdx] = { ...sys, content: `${sys.content}\n\n${block}` }
    }
  } else {
    prompt.unshift({ role: "system", content: block })
  }
  return { ...params, prompt }
}

function extractAssistantText(result: LanguageModelV3GenerateResult): string | null {
  for (const part of result.content) {
    if (part.type === "text" && part.text.trim()) return part.text.trim()
  }
  return null
}

export function createMemoryMiddleware(
  engine: MemoryEngine,
  config: MemoryMiddlewareConfig
): LanguageModelMiddleware {
  const {
    projectId,
    sessionId,
    searchOptions = {},
    autoStore = true,
    autoRecall = true,
    systemPromptTemplate = defaultSystemPromptTemplate,
  } = config

  const limit = searchOptions.limit ?? 5
  const minScore = searchOptions.minScore ?? 0.55
  const windowSize = searchOptions.windowSize ?? 40
  const expandGraph = searchOptions.expandGraph ?? false

  return {
    specificationVersion: "v3",

    async transformParams({ params }) {
      if (!autoRecall) return params
      const userText = extractLastUserText(params)
      if (!userText) return params
      const memories = await engine.search({
        query: userText,
        project_id: projectId,
        session_id: sessionId,
        limit,
        min_score: minScore,
        window_size: windowSize,
        expand_graph: expandGraph,
      })
      if (memories.length === 0) return params
      return injectMemory(params, systemPromptTemplate(memories))
    },

    async wrapGenerate({ doGenerate }) {
      const result = await doGenerate()
      if (autoStore) {
        const text = extractAssistantText(result)
        if (text) {
          await engine.add({ content: text, session_id: sessionId, project_id: projectId }).catch(() => {})
        }
      }
      return result
    },

    async wrapStream({ doStream }) {
      const result = await doStream()
      if (!autoStore) return result

      let accumulated = ""
      type StreamPart = Awaited<LanguageModelV3StreamResult>["stream"] extends ReadableStream<infer T> ? T : never

      const transformedStream = result.stream.pipeThrough(
        new TransformStream<StreamPart, StreamPart>({
          transform(chunk, controller) {
            if (chunk.type === "text-delta") accumulated += chunk.delta
            controller.enqueue(chunk)
          },
          async flush() {
            if (accumulated.trim()) {
              await engine.add({ content: accumulated.trim(), session_id: sessionId, project_id: projectId }).catch(() => {})
            }
          },
        })
      )

      return { ...result, stream: transformedStream }
    },
  }
}
