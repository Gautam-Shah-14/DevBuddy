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

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  existed_before INTEGER NOT NULL,
  content_before TEXT,
  reverted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  success INTEGER NOT NULL,
  result_preview TEXT,
  kind TEXT NOT NULL,
  skill_name TEXT,
  connector_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
`;

const RESULT_PREVIEW_MAX_CHARS = 500;

/** Every tool call is a "builtin" unless it's use_skill (a skill load) or
 *  namespaced mcp__<connector>__<tool> (an MCP connector call). */
function classifyToolCall(toolName: string, argumentsJson: string): { kind: "builtin" | "skill" | "connector"; skillName: string | null; connectorName: string | null } {
  if (toolName === "use_skill") {
    let skillName: string | null = null;
    try {
      skillName = (JSON.parse(argumentsJson) as { name?: string }).name ?? null;
    } catch {
      // malformed arguments - still record the event, just without a skill name
    }
    return { kind: "skill", skillName, connectorName: null };
  }
  if (toolName.startsWith("mcp__")) {
    const connectorName = toolName.split("__")[1] ?? null;
    return { kind: "connector", skillName: null, connectorName };
  }
  return { kind: "builtin", skillName: null, connectorName: null };
}

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

  /** Returns the new row's id - used to mark a just-inserted summary message
   *  as a session's compaction point (see setCompactionPoint). */
  addMessage(
    sessionId: number,
    message: ChatMessage,
    toolCallsJson?: string,
    usage?: { promptTokens?: number; completionTokens?: number }
  ): number {
    const result = this.db
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
    return Number(result.lastInsertRowid);
  }

  /**
   * A session's history as plain role+content messages, each tagged with
   * its row id - deliberately without tool_calls/tool_call_id, so it's
   * always safe to hand the content straight back to any provider as prior
   * turns (no dangling unresolved tool call to reconcile). The ids are for
   * compaction bookkeeping (see compactSession/setCompactionPoint), not for
   * the provider.
   *
   * If the session has been compacted, this returns the summary message
   * (wherever it was inserted) followed by everything from the kept-verbatim
   * cutoff onward - not the full pre-compaction history - so resuming a
   * long-since-compacted session doesn't immediately reload the very bulk
   * that was compacted away. The summary's own row id is always the largest
   * (it's inserted after the messages it summarizes), which is why it can't
   * just be "the smallest id kept" - it's tracked and prepended separately.
   * devbuddy history show is unaffected: it always reads the full raw log
   * via getTranscript.
   */
  getSessionMessagesWithIds(sessionId: number): (ChatMessage & { id: number })[] {
    const session = this.db
      .prepare("SELECT compacted_before_id, summary_message_id FROM sessions WHERE id = ?")
      .get(sessionId) as { compacted_before_id: number | null; summary_message_id: number | null } | undefined;

    type Row = { id: number; role: string; content: string };
    let rows: Row[];

    if (session?.summary_message_id != null && session.compacted_before_id != null) {
      const summaryRow = this.db
        .prepare("SELECT id, role, content FROM messages WHERE id = ?")
        .get(session.summary_message_id) as Row | undefined;
      const restRows = this.db
        .prepare("SELECT id, role, content FROM messages WHERE session_id = ? AND id >= ? AND id != ? ORDER BY id ASC")
        .all(sessionId, session.compacted_before_id, session.summary_message_id) as Row[];
      rows = summaryRow ? [summaryRow, ...restRows] : restRows;
    } else {
      rows = this.db
        .prepare("SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY id ASC")
        .all(sessionId) as Row[];
    }

    return rows.map((r) => ({ id: r.id, role: r.role as ChatMessage["role"], content: r.content }));
  }

  /** Same as getSessionMessagesWithIds, without the ids - for callers that
   *  only need the messages themselves (e.g. resuming a session). */
  getSessionMessages(sessionId: number): ChatMessage[] {
    return this.getSessionMessagesWithIds(sessionId).map(({ role, content }) => ({ role, content }));
  }

  /**
   * Records that a session was compacted: summaryMessageId is the row id of
   * the just-inserted summary message, and keepFromMessageId is the row id
   * of the first message kept verbatim after it (both from
   * getSessionMessagesWithIds - see compactSession in commands/chat.ts).
   */
  setCompactionPoint(sessionId: number, summaryMessageId: number, keepFromMessageId: number): void {
    this.db
      .prepare("UPDATE sessions SET summary_message_id = ?, compacted_before_id = ? WHERE id = ?")
      .run(summaryMessageId, keepFromMessageId, sessionId);
  }

  /** Reopens a previously-ended session so a new chat process can keep
   *  appending to it, and refreshes its provider/model to the ones this
   *  run is actually using (which may differ from when it was last open). */
  reopenSession(sessionId: number, provider: string, model: string): void {
    this.db.prepare("UPDATE sessions SET ended_at = NULL, provider = ?, model = ? WHERE id = ?").run(provider, model, sessionId);
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

  /**
   * Records the pre-mutation state of a file right before a write/edit/
   * delete tool changes it, so `devbuddy undo` can restore it later.
   * `contentBefore` is null when the file didn't exist yet (a new file) -
   * undoing that checkpoint deletes the file instead of restoring content.
   */
  addCheckpoint(
    sessionId: number,
    toolName: string,
    filePath: string,
    existedBefore: boolean,
    contentBefore: string | null
  ): number {
    const result = this.db
      .prepare(
        "INSERT INTO checkpoints (session_id, tool_name, file_path, existed_before, content_before, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(sessionId, toolName, filePath, existedBefore ? 1 : 0, contentBefore, new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  /** Most recent not-yet-reverted checkpoint in this project, across every session. */
  getLatestCheckpoint(): Checkpoint | null {
    const row = this.db
      .prepare("SELECT * FROM checkpoints WHERE reverted = 0 ORDER BY id DESC LIMIT 1")
      .get() as unknown as CheckpointRow | undefined;
    return row ? toCheckpoint(row) : null;
  }

  listCheckpoints(limit = 20): Checkpoint[] {
    const rows = this.db.prepare("SELECT * FROM checkpoints ORDER BY id DESC LIMIT ?").all(limit) as unknown as CheckpointRow[];
    return rows.map(toCheckpoint);
  }

  markCheckpointReverted(id: number): void {
    this.db.prepare("UPDATE checkpoints SET reverted = 1 WHERE id = ?").run(id);
  }

  /**
   * Records one tool invocation - what was called, with what arguments,
   * whether it succeeded (by the same "does the result start with Error"
   * convention the agent loop already uses), and a truncated preview of
   * the result (the full result already lives in the messages table as a
   * role:"tool" message - this is a lighter secondary index for
   * usage/reliability reporting, not a second full copy). Classifies the
   * call as a skill load (use_skill), an MCP connector call
   * (mcp__<connector>__<tool>), or a plain builtin tool.
   */
  addToolEvent(sessionId: number, toolName: string, argumentsJson: string, success: boolean, resultPreview: string): void {
    const { kind, skillName, connectorName } = classifyToolCall(toolName, argumentsJson);
    const preview =
      resultPreview.length > RESULT_PREVIEW_MAX_CHARS ? resultPreview.slice(0, RESULT_PREVIEW_MAX_CHARS) + "..." : resultPreview;
    this.db
      .prepare(
        `INSERT INTO tool_events
           (session_id, tool_name, arguments_json, success, result_preview, kind, skill_name, connector_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sessionId, toolName, argumentsJson, success ? 1 : 0, preview, kind, skillName, connectorName, new Date().toISOString());
  }

  /** Tool call pass/fail counts, overall and broken down per tool. Pass a
   *  sessionId to scope to one session, or omit for the whole project. */
  getToolStats(sessionId?: number): ToolStats {
    return computeToolStats(this.db, sessionId);
  }

  /** Which skills were loaded (via use_skill) and how often, most-used first. */
  getSkillUsage(sessionId?: number): UsageEntry[] {
    return getUsageByKind(this.db, "skill", "skill_name", sessionId);
  }

  /** Which MCP connectors were called and how often, most-used first. */
  getConnectorUsage(sessionId?: number): UsageEntry[] {
    return getUsageByKind(this.db, "connector", "connector_name", sessionId);
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

  /** Same no-side-effect read pattern as readStats, for `devbuddy stats --all`. */
  static toolStatsFrom(dbFile: string, sessionId?: number): ToolStats | null {
    return withReadOnlyDb(dbFile, (db) => computeToolStats(db, sessionId));
  }

  /** Same no-side-effect read pattern as readStats, for `devbuddy stats --all`. */
  static skillUsageFrom(dbFile: string, sessionId?: number): UsageEntry[] {
    return withReadOnlyDb(dbFile, (db) => getUsageByKind(db, "skill", "skill_name", sessionId)) ?? [];
  }

  /** Same no-side-effect read pattern as readStats, for `devbuddy stats --all`. */
  static connectorUsageFrom(dbFile: string, sessionId?: number): UsageEntry[] {
    return withReadOnlyDb(dbFile, (db) => getUsageByKind(db, "connector", "connector_name", sessionId)) ?? [];
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
  ensureColumn(db, "sessions", "compacted_before_id", "INTEGER");
  ensureColumn(db, "sessions", "summary_message_id", "INTEGER");
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

export interface Checkpoint {
  id: number;
  sessionId: number;
  toolName: string;
  filePath: string;
  existedBefore: boolean;
  contentBefore: string | null;
  reverted: boolean;
  createdAt: string;
}

interface CheckpointRow {
  id: number;
  session_id: number;
  tool_name: string;
  file_path: string;
  existed_before: number;
  content_before: string | null;
  reverted: number;
  created_at: string;
}

function toCheckpoint(r: CheckpointRow): Checkpoint {
  return {
    id: r.id,
    sessionId: r.session_id,
    toolName: r.tool_name,
    filePath: r.file_path,
    existedBefore: r.existed_before === 1,
    contentBefore: r.content_before,
    reverted: r.reverted === 1,
    createdAt: r.created_at,
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

export interface ToolStats {
  total: number;
  passed: number;
  failed: number;
  byTool: { toolName: string; total: number; passed: number; failed: number }[];
}

function computeToolStats(db: DatabaseSync, sessionId?: number): ToolStats {
  const where = sessionId !== undefined ? "WHERE session_id = ?" : "";
  const args = sessionId !== undefined ? [sessionId] : [];

  const totals = db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(success), 0) AS passed FROM tool_events ${where}`)
    .get(...args) as { total: number; passed: number };

  const byToolRows = db
    .prepare(
      `SELECT tool_name, COUNT(*) AS total, COALESCE(SUM(success), 0) AS passed
       FROM tool_events ${where}
       GROUP BY tool_name
       ORDER BY total DESC`
    )
    .all(...args) as { tool_name: string; total: number; passed: number }[];

  return {
    total: totals.total,
    passed: totals.passed,
    failed: totals.total - totals.passed,
    byTool: byToolRows.map((r) => ({ toolName: r.tool_name, total: r.total, passed: r.passed, failed: r.total - r.passed })),
  };
}

export interface UsageEntry {
  name: string;
  count: number;
  lastUsedAt: string;
}

function getUsageByKind(
  db: DatabaseSync,
  kind: "skill" | "connector",
  nameColumn: "skill_name" | "connector_name",
  sessionId?: number
): UsageEntry[] {
  const sessionClause = sessionId !== undefined ? "AND session_id = ?" : "";
  const args = sessionId !== undefined ? [kind, sessionId] : [kind];

  const rows = db
    .prepare(
      `SELECT ${nameColumn} AS name, COUNT(*) AS count, MAX(created_at) AS last_used_at
       FROM tool_events
       WHERE kind = ? ${sessionClause} AND ${nameColumn} IS NOT NULL
       GROUP BY ${nameColumn}
       ORDER BY count DESC`
    )
    .all(...args) as { name: string; count: number; last_used_at: string }[];

  return rows.map((r) => ({ name: r.name, count: r.count, lastUsedAt: r.last_used_at }));
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
