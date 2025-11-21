import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const DB_PATH = join(process.env.HOME || "", ".vibetracker", "transcripts.db");

export interface SessionData {
  sessionId: string;
  projectPath?: string;
  gitBranch?: string;
  startedAt?: Date;
  lastActivityAt?: Date;
}

export interface MessageData {
  sessionId: string;
  messageUuid: string;
  parentUuid?: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  stopReason?: string;
  isSidechain: boolean;
  agentId?: string;
  timestamp: Date;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface ToolCallData {
  messageId: number;
  sessionId: string;
  agentId?: string;
  toolUseId: string;
  toolName: string;
  toolInput: string;
  toolResult?: string;
  isError: boolean;
  durationMs?: number;
  timestamp: Date;
}

export interface AgentData {
  agentId: string;
  sessionId: string;
  parentMessageUuid?: string;
  subagentType?: string;
  prompt?: string;
  status?: string;
  model?: string;
  totalDurationMs?: number;
  totalTokens?: number;
  totalToolCalls?: number;
  startedAt?: Date;
  completedAt?: Date;
}

function getDb(): Database {
  // Ensure directory exists
  const dbDir = join(process.env.HOME || "", ".vibetracker");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  createTables(db);

  return db;
}

function createTables(db: Database): void {
  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      project_path TEXT,
      git_branch TEXT,
      started_at TIMESTAMP,
      last_activity_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)`);

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      message_uuid TEXT UNIQUE NOT NULL,
      parent_uuid TEXT,
      role TEXT NOT NULL,
      content TEXT,
      model TEXT,
      stop_reason TEXT,
      is_sidechain INTEGER DEFAULT 0,
      agent_id TEXT,
      timestamp TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER,

      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(message_uuid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_uuid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);

  // Tool calls table
  db.run(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      tool_use_id TEXT UNIQUE NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_result TEXT,
      is_error INTEGER DEFAULT 0,
      duration_ms INTEGER,
      timestamp TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_agent ON tool_calls(agent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_timestamp ON tool_calls(timestamp)`);

  // Agents table
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      session_id TEXT NOT NULL,
      parent_message_uuid TEXT,
      subagent_type TEXT,
      prompt TEXT,
      status TEXT,
      model TEXT,

      total_duration_ms INTEGER,
      total_tokens INTEGER,
      total_tool_calls INTEGER,

      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(subagent_type)`);
}

export function upsertSession(data: SessionData): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO sessions (session_id, project_path, git_branch, started_at, last_activity_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      project_path = COALESCE(excluded.project_path, project_path),
      git_branch = COALESCE(excluded.git_branch, git_branch),
      started_at = COALESCE(excluded.started_at, started_at),
      last_activity_at = COALESCE(excluded.last_activity_at, last_activity_at)
  `);

  stmt.run(
    data.sessionId,
    data.projectPath || null,
    data.gitBranch || null,
    data.startedAt?.toISOString() || null,
    data.lastActivityAt?.toISOString() || null
  );

  db.close();
}

export function insertMessage(data: MessageData): number {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO messages (
      session_id, message_uuid, parent_uuid, role, content, model, stop_reason,
      is_sidechain, agent_id, timestamp,
      input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_uuid) DO NOTHING
  `);

  stmt.run(
    data.sessionId,
    data.messageUuid,
    data.parentUuid || null,
    data.role,
    data.content,
    data.model || null,
    data.stopReason || null,
    data.isSidechain ? 1 : 0,
    data.agentId || null,
    data.timestamp.toISOString(),
    data.inputTokens || null,
    data.outputTokens || null,
    data.cacheReadTokens || null,
    data.cacheCreationTokens || null
  );

  // Get the message ID
  const result = db.query(`SELECT id FROM messages WHERE message_uuid = ?`).get(data.messageUuid) as { id: number } | null;
  const messageId = result?.id || 0;

  db.close();

  return messageId;
}

export function insertToolCall(data: ToolCallData): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO tool_calls (
      message_id, session_id, agent_id, tool_use_id, tool_name,
      tool_input, tool_result, is_error, duration_ms, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool_use_id) DO NOTHING
  `);

  stmt.run(
    data.messageId,
    data.sessionId,
    data.agentId || null,
    data.toolUseId,
    data.toolName,
    data.toolInput,
    data.toolResult || null,
    data.isError ? 1 : 0,
    data.durationMs || null,
    data.timestamp.toISOString()
  );

  db.close();
}

export function upsertAgent(data: AgentData): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO agents (
      agent_id, session_id, parent_message_uuid, subagent_type, prompt, status, model,
      total_duration_ms, total_tokens, total_tool_calls, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      status = COALESCE(excluded.status, status),
      total_duration_ms = COALESCE(excluded.total_duration_ms, total_duration_ms),
      total_tokens = COALESCE(excluded.total_tokens, total_tokens),
      total_tool_calls = COALESCE(excluded.total_tool_calls, total_tool_calls),
      completed_at = COALESCE(excluded.completed_at, completed_at)
  `);

  stmt.run(
    data.agentId,
    data.sessionId,
    data.parentMessageUuid || null,
    data.subagentType || null,
    data.prompt || null,
    data.status || null,
    data.model || null,
    data.totalDurationMs || null,
    data.totalTokens || null,
    data.totalToolCalls || null,
    data.startedAt?.toISOString() || null,
    data.completedAt?.toISOString() || null
  );

  db.close();
}
