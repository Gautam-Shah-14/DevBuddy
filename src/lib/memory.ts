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

  listSessions(limit = 20): SessionSummary[] {
    return listSessions(this.db, limit);
  }

  getTranscript(sessionId: number): TranscriptMessage[] {
    return getTranscript(this.db, sessionId);
  }

  search(query: string, limit = 50): SearchHit[] {
    return search(this.db, query, limit);
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
    return withReadOnlyDb(dbFile, computeStats);
  }

  /** Same no-side-effect read pattern as readStats, for `devbuddy history --all`. */
  static listSessionsFrom(dbFile: string, limit = 20): SessionSummary[] {
    return withReadOnlyDb(dbFile, (db) => listSessions(db, limit)) ?? [];
  }

  /** Same no-side-effect read pattern as readStats, for `devbuddy history search --all`. */
  static searchFrom(dbFile: string, query: string, limit = 50): SearchHit[] {
    return withReadOnlyDb(dbFile, (db) => search(db, query, limit)) ?? [];
  }

  /** Same no-side-effect read pattern as readStats, for `devbuddy history show`. */
  static getTranscriptFrom(dbFile: string, sessionId: number): TranscriptMessage[] {
    return withReadOnlyDb(dbFile, (db) => getTranscript(db, sessionId)) ?? [];
  }
}

function withReadOnlyDb<T>(dbFile: string, fn: (db: DatabaseSync) => T): T | null {
  if (!existsSync(dbFile)) return null;
  const db = new DatabaseSync(dbFile);
  try {
    db.exec(SCHEMA);
    migrate(db);
    return fn(db);
  } finally {
    db.close();
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

export interface SessionSummary {
  id: number;
  startedAt: string;
  endedAt: string | null;
  provider: string | null;
  model: string | null;
  messageCount: number;
  firstUserMessage: string | null;
}

function listSessions(db: DatabaseSync, limit: number): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.started_at, s.ended_at, s.provider, s.model,
         (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count,
         (SELECT content FROM messages m2 WHERE m2.session_id = s.id AND m2.role = 'user' ORDER BY m2.id ASC LIMIT 1) AS first_user_message
       FROM sessions s ORDER BY s.id DESC LIMIT ?`
    )
    .all(limit) as {
    id: number;
    started_at: string;
    ended_at: string | null;
    provider: string | null;
    model: string | null;
    message_count: number;
    first_user_message: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    provider: r.provider,
    model: r.model,
    messageCount: r.message_count,
    firstUserMessage: r.first_user_message,
  }));
}

export interface TranscriptMessage {
  role: string;
  content: string;
  createdAt: string;
}

function getTranscript(db: DatabaseSync, sessionId: number): TranscriptMessage[] {
  const rows = db
    .prepare("SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId) as { role: string; content: string; created_at: string }[];
  return rows.map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));
}

export interface SearchHit {
  sessionId: number;
  role: string;
  content: string;
  createdAt: string;
}

function search(db: DatabaseSync, query: string, limit: number): SearchHit[] {
  const rows = db
    .prepare(
      `SELECT session_id, role, content, created_at FROM messages
       WHERE role IN ('user', 'assistant') AND content LIKE ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(`%${query}%`, limit) as { session_id: number; role: string; content: string; created_at: string }[];
  return rows.map((r) => ({ sessionId: r.session_id, role: r.role, content: r.content, createdAt: r.created_at }));
}
