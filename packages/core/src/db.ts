import { Database } from "bun:sqlite"
import { homedir } from "os"
import { join } from "path"
import { mkdirSync, statSync } from "fs"
import type { RetrievalMethod } from "./types"

const DEFAULT_DB_PATH = join(homedir(), ".memkit", "memory.db")

export function createDb(dbPath?: string, retrieval: RetrievalMethod = "vector"): Database {
  const resolvedPath = resolvePath(dbPath ?? DEFAULT_DB_PATH)
  const dir = resolvedPath.replace(/\/[^/]+$/, "")
  mkdirSync(dir, { recursive: true })

  const db = new Database(resolvedPath, { create: true })

  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA foreign_keys = ON")
  db.run("PRAGMA synchronous = NORMAL")

  migrate(db, retrieval)

  return db
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2))
  return p
}

function migrate(db: Database, retrieval: RetrievalMethod) {
  db.run(`
    CREATE TABLE IF NOT EXISTS session (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      label       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS session_project_idx ON session(project_id)`)

  db.run(`
    CREATE TABLE IF NOT EXISTS memory (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      project_id  TEXT NOT NULL,
      content     TEXT NOT NULL,
      metadata    TEXT,
      embedding   BLOB,
      dimensions  INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS memory_session_idx ON memory(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS memory_project_idx ON memory(project_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS memory_created_idx ON memory(created_at DESC)`)

  db.run(`
    CREATE TABLE IF NOT EXISTS memory_edge (
      id          TEXT PRIMARY KEY,
      src_id      TEXT NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
      dst_id      TEXT NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
      score       REAL NOT NULL,
      created_at  INTEGER NOT NULL,
      UNIQUE(src_id, dst_id)
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS edge_src_idx ON memory_edge(src_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS edge_dst_idx ON memory_edge(dst_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS edge_score_idx ON memory_edge(score DESC)`)

  if (retrieval === "fts" || retrieval === "hybrid") {
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        content,
        content='memory',
        content_rowid='rowid'
      )
    `)
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
        INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
      END
    `)
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
      END
    `)
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
        INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
      END
    `)
  }
}

export function getDbSize(db: Database): number {
  try {
    const row = db.query<{ page_count: number; page_size: number }, []>(
      "SELECT page_count, page_size FROM pragma_page_count(), pragma_page_size()"
    ).get()
    if (row) return row.page_count * row.page_size
  } catch {}
  return 0
}

export function floatsToBlob(arr: number[]): Buffer {
  const buf = Buffer.allocUnsafe(arr.length * 4)
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i]!, i * 4)
  return buf
}

export function blobToFloats(blob: Buffer | Uint8Array): number[] {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const len = buf.byteLength / 4
  const out: number[] = new Array(len)
  for (let i = 0; i < len; i++) out[i] = buf.readFloatLE(i * 4)
  return out
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
