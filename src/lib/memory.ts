import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { ChatMessage } from "../providers/types.js";
import { ensureProject } from "./project.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
`;

export class ProjectMemory {
  private db: DatabaseSync;

  constructor(absPath: string) {
    const paths = ensureProject(absPath);
    this.db = new DatabaseSync(paths.dbFile);
    this.db.exec(SCHEMA);
    migrate(this.db);
  }

  startSession(provider?: string, model?: string): number {
    const stmt = this.db.prepare("INSERT INTO sessions (started_at, provider, model) VALUES (?, ?, ?)");
    const result = stmt.run(new Date().toISOString(), provider ?? null, model ?? null);
    return Number(result.lastInsertRowid);
  }

  endSession(sessionId: number, summary?: string): void {
    this.db
      .prepare("UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?")
      .run(new Date().toISOString(), summary ?? null, sessionId);
  }

  addMessage(
    sessionId: number,
    message: ChatMessage,
    toolCallsJson?: string,
    usage?: { promptTokens?: number; completionTokens?: number }
  ): void {
    this.db
      .prepare(
        "INSERT INTO messages (session_id, role, content, tool_calls_json, created_at, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        sessionId,
        message.role,
        message.content,
        toolCallsJson ?? null,
        new Date().toISOString(),
        usage?.promptTokens ?? null,
        usage?.completionTokens ?? null
      );
  }

  getSessionMessages(sessionId: number): ChatMessage[] {
    const rows = this.db
      .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC")
      .all(sessionId) as { role: string; content: string }[];
    return rows.map((r) => ({ role: r.role as ChatMessage["role"], content: r.content }));
  }

  recordPlan(sessionId: number, filePath: string, title: string): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO plans (session_id, file_path, title, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)"
      )
      .run(sessionId, filePath, title, now, now);
    return Number(result.lastInsertRowid);
  }

  updatePlanStatus(planId: number, status: "pending" | "approved" | "rejected" | "done"): void {
    this.db
      .prepare("UPDATE plans SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), planId);
  }

  getStats(): ProjectStats {
    return computeStats(this.db);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Reads stats directly from a project's memory.db without going through
   * the normal constructor - avoids the side effect of touching the
   * project's meta.json (last_opened_at) just to check stats, which
   * matters when aggregating across every project via `devbuddy stats --all`.
   * Returns null if the project has no memory.db yet (never opened).
   */
  static readStats(dbFile: string): ProjectStats | null {
    if (!existsSync(dbFile)) return null;
    const db = new DatabaseSync(dbFile);
    try {
      db.exec(SCHEMA);
      migrate(db);
      return computeStats(db);
    } finally {
      db.close();
    }
  }
}

/** Adds columns introduced after the initial schema, safely for pre-existing databases. */
function migrate(db: DatabaseSync): void {
  ensureColumn(db, "sessions", "provider", "TEXT");
  ensureColumn(db, "sessions", "model", "TEXT");
  ensureColumn(db, "messages", "prompt_tokens", "INTEGER");
  ensureColumn(db, "messages", "completion_tokens", "INTEGER");
}

function ensureColumn(db: DatabaseSync, table: string, column: string, type: string): void {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function computeStats(db: DatabaseSync): ProjectStats {
  const sessionCount = (db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number }).c;
  const messageCount = (db.prepare("SELECT COUNT(*) AS c FROM messages").get() as { c: number }).c;
  const totals = db
    .prepare("SELECT COALESCE(SUM(prompt_tokens), 0) AS p, COALESCE(SUM(completion_tokens), 0) AS c FROM messages")
    .get() as { p: number; c: number };

  // Older messages (or providers that don't report usage) have no exact
  // count - estimate those from content length so totals aren't misleadingly low.
  const missing = db
    .prepare(
      "SELECT content FROM messages WHERE prompt_tokens IS NULL AND completion_tokens IS NULL AND role IN ('user', 'assistant')"
    )
    .all() as { content: string }[];
  const estimatedTokens = missing.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

  return {
    sessionCount,
    messageCount,
    exactPromptTokens: totals.p,
    exactCompletionTokens: totals.c,
    messagesWithoutUsage: missing.length,
    estimatedTokensForMissing: estimatedTokens,
  };
}

export interface ProjectStats {
  sessionCount: number;
  messageCount: number;
  exactPromptTokens: number;
  exactCompletionTokens: number;
  messagesWithoutUsage: number;
  estimatedTokensForMissing: number;
}
