import { Database } from "bun:sqlite"
import { homedir } from "os"
import { join } from "path"
import { mkdirSync } from "fs"

const DEFAULT_DB_PATH = join(homedir(), ".code-memory", "memory.db")

let _db: Database | null = null

export function getDb(): Database {
  if (_db) return _db

  const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH
  const dir = dbPath.replace(/\/[^/]+$/, "")
  mkdirSync(dir, { recursive: true })

  const db = new Database(dbPath, { create: true })

  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA foreign_keys = ON")
  db.run("PRAGMA synchronous = NORMAL")

  migrate(db)

  _db = db
  return db
}

function migrate(db: Database) {
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
      embedding   BLOB NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS memory_session_idx ON memory(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS memory_project_idx ON memory(project_id)`)

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
}

export function floatsToBlob(arr: number[]): Buffer {
  const buf = Buffer.allocUnsafe(arr.length * 4)
  for (let i = 0; i < arr.length; i++) {
    buf.writeFloatLE(arr[i]!, i * 4)
  }
  return buf
}

export function blobToFloats(blob: Buffer | Uint8Array): number[] {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const len = buf.byteLength / 4
  const out: number[] = new Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = buf.readFloatLE(i * 4)
  }
  return out
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  return dot / denom
}
