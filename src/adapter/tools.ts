import { tool } from "ai";
import {
    addMemory,
    searchMemory,
    deleteMemory,
    listSessions,
    getGraph,
    forgetSession,
} from "../memory";
import {
    AddMemoryInputSchema,
    SearchMemoryInputSchema,
    DeleteMemoryInputSchema,
    ListSessionsInputSchema,
    GetGraphInputSchema,
    ForgetSessionInputSchema,
} from "../types";

export const addMemoryTool = tool({
    description: "Store a new memory with semantic embedding and graph linking",
    inputSchema: AddMemoryInputSchema,
    execute: async (input) => {
        return await addMemory(input);
    },
});

export const searchMemoryTool = tool({
    description: "Search memories by semantic similarity within a project",
    inputSchema: SearchMemoryInputSchema,
    execute: async (input) => {
        return await searchMemory(input);
    },
});

export const deleteMemoryTool = tool({
    description: "Delete a memory by ID",
    inputSchema: DeleteMemoryInputSchema,
    execute: async (input) => {
        deleteMemory(input.id);
        return { ok: true };
    },
});

export const listSessionsTool = tool({
    description: "List all sessions, optionally filtered by project ID",
    inputSchema: ListSessionsInputSchema,
    execute: async (input) => {
        return listSessions(input);
    },
});

export const getGraphTool = tool({
    description:
        "Get the memory graph starting from a memory node up to a given depth",
    inputSchema: GetGraphInputSchema,
    execute: async (input) => {
        return getGraph(input);
    },
});

export const forgetSessionTool = tool({
    description: "Delete all memories belonging to a session",
    inputSchema: ForgetSessionInputSchema,
    execute: async (input) => {
        return forgetSession(input);
    },
});

export const memoryTools = {
    add_memory: addMemoryTool,
    search_memory: searchMemoryTool,
    delete_memory: deleteMemoryTool,
    list_sessions: listSessionsTool,
    get_graph: getGraphTool,
    forget_session: forgetSessionTool,
} as const;
