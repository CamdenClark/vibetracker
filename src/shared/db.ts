import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";

const DEFAULT_DB_PATH = join(process.env.HOME || "", ".vibetracker", "transcripts.db");

export interface SessionData {
  sessionId: string;
  provider: string;
  projectPath?: string;
  gitBranch?: string;
  startedAt?: Date;
  lastActivityAt?: Date;
  modelProvider?: string;
  providerMetadata?: Record<string, any>;
}

export interface MessageData {
  sessionId: string;
  provider: string;
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
  reasoningTokens?: number;
  providerMetadata?: Record<string, any>;
}

export interface ToolCallData {
  messageId: number;
  sessionId: string;
  provider: string;
  agentId?: string;
  toolUseId: string;
  toolName: string;
  toolInput: string;
  toolResult?: string;
  isError: boolean;
  durationMs?: number;
  timestamp: Date;
  providerMetadata?: Record<string, any>;
}

export interface AgentData {
  agentId: string;
  sessionId: string;
  provider: string;
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
  providerMetadata?: Record<string, any>;
}

function getDb(dbPath?: string): Database {
  const resolvedPath = dbPath || DEFAULT_DB_PATH;

  // Ensure directory exists
  const dbDir = dirname(resolvedPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(resolvedPath);

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
      provider TEXT NOT NULL,
      project_path TEXT,
      git_branch TEXT,
      started_at TIMESTAMP,
      last_activity_at TIMESTAMP,
      model_provider TEXT,
      provider_metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)`);

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL,
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
      reasoning_tokens INTEGER,
      provider_metadata TEXT,

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
      provider TEXT NOT NULL,
      agent_id TEXT,
      tool_use_id TEXT UNIQUE NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_result TEXT,
      is_error INTEGER DEFAULT 0,
      duration_ms INTEGER,
      timestamp TIMESTAMP,
      provider_metadata TEXT,
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
      provider TEXT NOT NULL,
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
      provider_metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(subagent_type)`);
}

export function upsertSession(data: SessionData, dbPath?: string): void {
  const db = getDb(dbPath);

  const stmt = db.prepare(`
    INSERT INTO sessions (session_id, provider, project_path, git_branch, started_at, last_activity_at, model_provider, provider_metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      provider = COALESCE(excluded.provider, provider),
      project_path = COALESCE(excluded.project_path, project_path),
      git_branch = COALESCE(excluded.git_branch, git_branch),
      started_at = COALESCE(excluded.started_at, started_at),
      last_activity_at = COALESCE(excluded.last_activity_at, last_activity_at),
      model_provider = COALESCE(excluded.model_provider, model_provider),
      provider_metadata = COALESCE(excluded.provider_metadata, provider_metadata)
  `);

  stmt.run(
    data.sessionId,
    data.provider,
    data.projectPath || null,
    data.gitBranch || null,
    data.startedAt?.toISOString() || null,
    data.lastActivityAt?.toISOString() || null,
    data.modelProvider || null,
    data.providerMetadata ? JSON.stringify(data.providerMetadata) : null
  );

  db.close();
}

export function insertMessage(data: MessageData, dbPath?: string): number {
  const db = getDb(dbPath);

  const stmt = db.prepare(`
    INSERT INTO messages (
      session_id, provider, message_uuid, parent_uuid, role, content, model, stop_reason,
      is_sidechain, agent_id, timestamp,
      input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
      provider_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_uuid) DO NOTHING
  `);

  stmt.run(
    data.sessionId,
    data.provider,
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
    data.cacheCreationTokens || null,
    data.reasoningTokens || null,
    data.providerMetadata ? JSON.stringify(data.providerMetadata) : null
  );

  // Get the message ID
  const result = db.query(`SELECT id FROM messages WHERE message_uuid = ?`).get(data.messageUuid) as { id: number } | null;
  const messageId = result?.id || 0;

  db.close();

  return messageId;
}

export function insertToolCall(data: ToolCallData, dbPath?: string): void {
  const db = getDb(dbPath);

  const stmt = db.prepare(`
    INSERT INTO tool_calls (
      message_id, session_id, provider, agent_id, tool_use_id, tool_name,
      tool_input, tool_result, is_error, duration_ms, timestamp, provider_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool_use_id) DO NOTHING
  `);

  stmt.run(
    data.messageId,
    data.sessionId,
    data.provider,
    data.agentId || null,
    data.toolUseId,
    data.toolName,
    data.toolInput,
    data.toolResult || null,
    data.isError ? 1 : 0,
    data.durationMs || null,
    data.timestamp.toISOString(),
    data.providerMetadata ? JSON.stringify(data.providerMetadata) : null
  );

  db.close();
}

export function upsertAgent(data: AgentData, dbPath?: string): void {
  const db = getDb(dbPath);

  const stmt = db.prepare(`
    INSERT INTO agents (
      agent_id, session_id, provider, parent_message_uuid, subagent_type, prompt, status, model,
      total_duration_ms, total_tokens, total_tool_calls, started_at, completed_at, provider_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      status = COALESCE(excluded.status, status),
      total_duration_ms = COALESCE(excluded.total_duration_ms, total_duration_ms),
      total_tokens = COALESCE(excluded.total_tokens, total_tokens),
      total_tool_calls = COALESCE(excluded.total_tool_calls, total_tool_calls),
      completed_at = COALESCE(excluded.completed_at, completed_at),
      provider_metadata = COALESCE(excluded.provider_metadata, provider_metadata)
  `);

  stmt.run(
    data.agentId,
    data.sessionId,
    data.provider,
    data.parentMessageUuid || null,
    data.subagentType || null,
    data.prompt || null,
    data.status || null,
    data.model || null,
    data.totalDurationMs || null,
    data.totalTokens || null,
    data.totalToolCalls || null,
    data.startedAt?.toISOString() || null,
    data.completedAt?.toISOString() || null,
    data.providerMetadata ? JSON.stringify(data.providerMetadata) : null
  );

  db.close();
}

/**
 * Save a complete parsed transcript in a single transaction
 * This is more efficient than calling individual insert functions
 */
export function saveTranscript(
  transcript: {
    session: SessionData;
    messages: MessageData[];
    toolCalls: ToolCallData[];
    agents: AgentData[];
  },
  dbPath?: string
): void {
  const db = getDb(dbPath);

  try {
    // Begin transaction
    db.run("BEGIN TRANSACTION");

    // Prepare statements
    const sessionStmt = db.prepare(`
      INSERT INTO sessions (session_id, provider, project_path, git_branch, started_at, last_activity_at, model_provider, provider_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        provider = COALESCE(excluded.provider, provider),
        project_path = COALESCE(excluded.project_path, project_path),
        git_branch = COALESCE(excluded.git_branch, git_branch),
        started_at = COALESCE(excluded.started_at, started_at),
        last_activity_at = COALESCE(excluded.last_activity_at, last_activity_at),
        model_provider = COALESCE(excluded.model_provider, model_provider),
        provider_metadata = COALESCE(excluded.provider_metadata, provider_metadata)
    `);

    const messageStmt = db.prepare(`
      INSERT INTO messages (
        session_id, provider, message_uuid, parent_uuid, role, content, model, stop_reason,
        is_sidechain, agent_id, timestamp,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
        provider_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_uuid) DO NOTHING
    `);

    const toolCallStmt = db.prepare(`
      INSERT INTO tool_calls (
        message_id, session_id, provider, agent_id, tool_use_id, tool_name,
        tool_input, tool_result, is_error, duration_ms, timestamp, provider_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tool_use_id) DO NOTHING
    `);

    const agentStmt = db.prepare(`
      INSERT INTO agents (
        agent_id, session_id, provider, parent_message_uuid, subagent_type, prompt, status, model,
        total_duration_ms, total_tokens, total_tool_calls, started_at, completed_at, provider_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        status = COALESCE(excluded.status, status),
        total_duration_ms = COALESCE(excluded.total_duration_ms, total_duration_ms),
        total_tokens = COALESCE(excluded.total_tokens, total_tokens),
        total_tool_calls = COALESCE(excluded.total_tool_calls, total_tool_calls),
        completed_at = COALESCE(excluded.completed_at, completed_at),
        provider_metadata = COALESCE(excluded.provider_metadata, provider_metadata)
    `);

    // Insert session
    sessionStmt.run(
      transcript.session.sessionId,
      transcript.session.provider,
      transcript.session.projectPath || null,
      transcript.session.gitBranch || null,
      transcript.session.startedAt?.toISOString() || null,
      transcript.session.lastActivityAt?.toISOString() || null,
      transcript.session.modelProvider || null,
      transcript.session.providerMetadata ? JSON.stringify(transcript.session.providerMetadata) : null
    );

    // Insert messages and build messageIdMap (UUID -> DB ID)
    const messageUuidToDbId = new Map<string, number>();
    for (const message of transcript.messages) {
      messageStmt.run(
        message.sessionId,
        message.provider,
        message.messageUuid,
        message.parentUuid || null,
        message.role,
        message.content,
        message.model || null,
        message.stopReason || null,
        message.isSidechain ? 1 : 0,
        message.agentId || null,
        message.timestamp.toISOString(),
        message.inputTokens || null,
        message.outputTokens || null,
        message.cacheReadTokens || null,
        message.cacheCreationTokens || null,
        message.reasoningTokens || null,
        message.providerMetadata ? JSON.stringify(message.providerMetadata) : null
      );

      // Get the database ID for this message
      const result = db.query(`SELECT id FROM messages WHERE message_uuid = ?`).get(message.messageUuid) as { id: number } | null;
      if (result) {
        messageUuidToDbId.set(message.messageUuid, result.id);
      }
    }

    // Insert tool calls
    // The parsers create tool calls with a messageId based on a sequential counter
    // We need to map that to the actual database ID using the message UUID
    // Build a reverse map: sequential index -> message UUID
    const indexToUuid = new Map<number, string>();
    transcript.messages.forEach((msg, index) => {
      indexToUuid.set(index + 1, msg.messageUuid); // parsers use 1-based counter
    });

    for (const toolCall of transcript.toolCalls) {
      // Get the actual database message ID
      // First, try to find which message this tool belongs to by its messageId field
      let dbMessageId: number | undefined;

      if (toolCall.messageId && toolCall.messageId > 0) {
        // The messageId from the parser is a sequential counter
        // Map it to the message UUID, then to the database ID
        const messageUuid = indexToUuid.get(toolCall.messageId);
        if (messageUuid) {
          dbMessageId = messageUuidToDbId.get(messageUuid);
        }
      }

      if (!dbMessageId) {
        console.error(`Warning: Could not find database message ID for tool call ${toolCall.toolUseId}, skipping`);
        continue;
      }

      toolCallStmt.run(
        dbMessageId,
        toolCall.sessionId,
        toolCall.provider,
        toolCall.agentId || null,
        toolCall.toolUseId,
        toolCall.toolName,
        toolCall.toolInput,
        toolCall.toolResult || null,
        toolCall.isError ? 1 : 0,
        toolCall.durationMs || null,
        toolCall.timestamp.toISOString(),
        toolCall.providerMetadata ? JSON.stringify(toolCall.providerMetadata) : null
      );
    }

    // Insert agents
    for (const agent of transcript.agents) {
      agentStmt.run(
        agent.agentId,
        agent.sessionId,
        agent.provider,
        agent.parentMessageUuid || null,
        agent.subagentType || null,
        agent.prompt || null,
        agent.status || null,
        agent.model || null,
        agent.totalDurationMs || null,
        agent.totalTokens || null,
        agent.totalToolCalls || null,
        agent.startedAt?.toISOString() || null,
        agent.completedAt?.toISOString() || null,
        agent.providerMetadata ? JSON.stringify(agent.providerMetadata) : null
      );
    }

    // Commit transaction
    db.run("COMMIT");
  } catch (error) {
    // Rollback on error
    db.run("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
