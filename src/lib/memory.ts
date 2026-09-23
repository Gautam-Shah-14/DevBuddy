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
  }

  startSession(): number {
    const stmt = this.db.prepare("INSERT INTO sessions (started_at) VALUES (?)");
    const result = stmt.run(new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  endSession(sessionId: number, summary?: string): void {
    this.db
      .prepare("UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?")
      .run(new Date().toISOString(), summary ?? null, sessionId);
  }

  addMessage(sessionId: number, message: ChatMessage, toolCallsJson?: string): void {
    this.db
      .prepare(
        "INSERT INTO messages (session_id, role, content, tool_calls_json, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(sessionId, message.role, message.content, toolCallsJson ?? null, new Date().toISOString());
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

  close(): void {
    this.db.close();
  }
}
