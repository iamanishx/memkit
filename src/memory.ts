import { randomUUID } from "crypto";
import { getDb, floatsToBlob, blobToFloats, cosineSimilarity } from "./db";
import { getEmbeddingBackend } from "./embeddings/index";
import type {
    AddMemoryInput,
    AddMemoryResult,
    SearchMemoryInput,
    SearchResult,
    GetGraphInput,
    GraphResult,
    ForgetSessionInput,
    ListSessionsInput,
    EnsureSessionInput,
    Session,
    MemoryMetadata,
} from "./types";

const EDGE_THRESHOLD = parseFloat(process.env.EDGE_THRESHOLD ?? "0.82");
const EDGE_TOP_K = parseInt(process.env.EDGE_TOP_K ?? "10", 10);

export function ensureSession(input: EnsureSessionInput): Session {
    const db = getDb();
    const now = Date.now();

    const existing = db
        .query<
            Session,
            [string]
        >("SELECT id, project_id, label, created_at, updated_at FROM session WHERE id = ?")
        .get(input.session_id);

    if (existing) return existing;

    db.run(
        "INSERT INTO session (id, project_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [input.session_id, input.project_id, input.label ?? null, now, now],
    );

    return {
        id: input.session_id,
        project_id: input.project_id,
        label: input.label,
        created_at: now,
        updated_at: now,
    };
}

export async function addMemory(
    input: AddMemoryInput,
): Promise<AddMemoryResult> {
    const db = getDb();
    const backend = await getEmbeddingBackend();

    ensureSession({
        session_id: input.session_id,
        project_id: input.project_id,
    });

    const embedding = await backend.embed(input.content);
    const embBlob = floatsToBlob(embedding);
    const id = `mem_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    db.run(
        `INSERT INTO memory (id, session_id, project_id, content, metadata, embedding, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            input.session_id,
            input.project_id,
            input.content,
            input.metadata ? JSON.stringify(input.metadata) : null,
            embBlob,
            now,
            now,
        ],
    );

    const neighbors = db
        .query<
            { id: string; embedding: Buffer },
            [string, string]
        >("SELECT id, embedding FROM memory WHERE project_id = ? AND id != ? ")
        .all(input.project_id, id);

    let linked = 0;

    for (const neighbor of neighbors.slice(0, EDGE_TOP_K * 4)) {
        const neighborEmb = blobToFloats(neighbor.embedding);
        const score = cosineSimilarity(embedding, neighborEmb);
        if (score >= EDGE_THRESHOLD) {
            const edgeId = `edge_${randomUUID().replace(/-/g, "")}`;
            try {
                db.run(
                    "INSERT OR IGNORE INTO memory_edge (id, src_id, dst_id, score, created_at) VALUES (?, ?, ?, ?, ?)",
                    [edgeId, id, neighbor.id, score, now],
                );
                linked++;
            } catch {}
        }
        if (linked >= EDGE_TOP_K) break;
    }

    return { id, linked_count: linked };
}

export async function searchMemory(
    input: SearchMemoryInput,
): Promise<SearchResult[]> {
    const db = getDb();
    const backend = await getEmbeddingBackend();

    const queryEmb = await backend.embed(input.query);

    type RowType = {
        id: string;
        content: string;
        session_id: string;
        project_id: string;
        metadata: string | null;
        embedding: Buffer;
    };

    const rows = input.session_id
        ? db
              .query<
                  RowType,
                  [string, string]
              >("SELECT id, content, session_id, project_id, metadata, embedding FROM memory WHERE project_id = ? AND session_id = ?")
              .all(input.project_id, input.session_id)
        : db
              .query<
                  RowType,
                  [string]
              >("SELECT id, content, session_id, project_id, metadata, embedding FROM memory WHERE project_id = ?")
              .all(input.project_id);

    const scored = rows
        .map((row) => ({
            ...row,
            score: cosineSimilarity(queryEmb, blobToFloats(row.embedding)),
        }))
        .filter((r) => r.score >= input.min_score)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit);

    const results: SearchResult[] = scored.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        session_id: r.session_id,
        project_id: r.project_id,
        metadata: r.metadata
            ? (JSON.parse(r.metadata) as MemoryMetadata)
            : undefined,
    }));

    if (input.expand_graph && results.length > 0) {
        const topIds = results.map((r) => r.id);
        const neighborMap = new Map<
            string,
            { id: string; content: string; score: number }[]
        >();

        for (const memId of topIds) {
            const edges = db
                .query<
                    { neighbor_id: string; score: number },
                    [string, string, string]
                >(
                    `SELECT CASE WHEN src_id = ? THEN dst_id ELSE src_id END as neighbor_id, score
         FROM memory_edge WHERE src_id = ? OR dst_id = ?`,
                )
                .all(memId, memId, memId);

            const neighbors: { id: string; content: string; score: number }[] =
                [];
            for (const edge of edges) {
                if (topIds.includes(edge.neighbor_id)) continue;
                const mem = db
                    .query<
                        { id: string; content: string },
                        [string]
                    >("SELECT id, content FROM memory WHERE id = ?")
                    .get(edge.neighbor_id);
                if (mem)
                    neighbors.push({
                        id: mem.id,
                        content: mem.content,
                        score: edge.score,
                    });
            }
            if (neighbors.length > 0) neighborMap.set(memId, neighbors);
        }

        for (const result of results) {
            const neighbors = neighborMap.get(result.id);
            if (neighbors) result.neighbors = neighbors;
        }
    }

    return results;
}

export function deleteMemory(id: string): void {
    const db = getDb();
    db.run("DELETE FROM memory WHERE id = ?", [id]);
}

export function listSessions(input: ListSessionsInput): Session[] {
    const db = getDb();
    if (input.project_id) {
        return db
            .query<
                Session,
                [string]
            >("SELECT id, project_id, label, created_at, updated_at FROM session WHERE project_id = ? ORDER BY created_at DESC")
            .all(input.project_id);
    }
    return db
        .query<
            Session,
            []
        >("SELECT id, project_id, label, created_at, updated_at FROM session ORDER BY created_at DESC")
        .all();
}

export function getGraph(input: GetGraphInput): GraphResult {
    const db = getDb();

    const visited = new Set<string>();
    const nodeMap = new Map<
        string,
        { id: string; content: string; metadata?: MemoryMetadata }
    >();
    const edges: Array<{ src_id: string; dst_id: string; score: number }> = [];

    function traverse(memId: string, depth: number) {
        if (depth === 0 || visited.has(memId)) return;
        visited.add(memId);

        const mem = db
            .query<
                { id: string; content: string; metadata: string | null },
                [string]
            >("SELECT id, content, metadata FROM memory WHERE id = ?")
            .get(memId);

        if (!mem) return;

        nodeMap.set(memId, {
            id: mem.id,
            content: mem.content,
            metadata: mem.metadata
                ? (JSON.parse(mem.metadata) as MemoryMetadata)
                : undefined,
        });

        const edgeRows = db
            .query<
                { src_id: string; dst_id: string; score: number },
                [string, string]
            >("SELECT src_id, dst_id, score FROM memory_edge WHERE src_id = ? OR dst_id = ?")
            .all(memId, memId);

        for (const edge of edgeRows) {
            const alreadyAdded = edges.some(
                (e) =>
                    (e.src_id === edge.src_id && e.dst_id === edge.dst_id) ||
                    (e.src_id === edge.dst_id && e.dst_id === edge.src_id),
            );
            if (!alreadyAdded)
                edges.push({
                    src_id: edge.src_id,
                    dst_id: edge.dst_id,
                    score: edge.score,
                });
            const nextId = edge.src_id === memId ? edge.dst_id : edge.src_id;
            traverse(nextId, depth - 1);
        }
    }

    traverse(input.memory_id, input.depth);

    return {
        nodes: Array.from(nodeMap.values()),
        edges,
    };
}

export function forgetSession(input: ForgetSessionInput): {
    deleted_count: number;
} {
    const db = getDb();
    const count = db
        .query<
            { count: number },
            [string]
        >("SELECT COUNT(*) as count FROM memory WHERE session_id = ?")
        .get(input.session_id);

    db.run("DELETE FROM session WHERE id = ?", [input.session_id]);

    return { deleted_count: count?.count ?? 0 };
}
