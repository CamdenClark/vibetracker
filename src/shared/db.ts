import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

const DEFAULT_DB_PATH = join(
  process.env.HOME || "",
  ".vibetracker",
  "transcripts.db"
);

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

function getDb(dbPath?: string) {
  const resolvedPath = dbPath || DEFAULT_DB_PATH;

  // Ensure directory exists
  const dbDir = dirname(resolvedPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(resolvedPath);

  // Enable foreign keys
  sqlite.run("PRAGMA foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

/**
 * Run migrations on the database
 */
export function runMigrations(dbPath?: string): void {
  const { db, sqlite } = getDb(dbPath);

  try {
    migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });
  } finally {
    sqlite.close();
  }
}

/**
 * Initialize the database (runs migrations)
 */
export function initDb(dbPath?: string): void {
  runMigrations(dbPath);
}

export function upsertSession(data: SessionData, dbPath?: string): void {
  const { db, sqlite } = getDb(dbPath);

  try {
    // Run migrations first
    migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

    db.insert(schema.sessions)
      .values({
        sessionId: data.sessionId,
        provider: data.provider,
        projectPath: data.projectPath || null,
        gitBranch: data.gitBranch || null,
        startedAt: data.startedAt?.toISOString() || null,
        lastActivityAt: data.lastActivityAt?.toISOString() || null,
        modelProvider: data.modelProvider || null,
        providerMetadata: data.providerMetadata
          ? JSON.stringify(data.providerMetadata)
          : null,
      })
      .onConflictDoUpdate({
        target: schema.sessions.sessionId,
        set: {
          provider: sql`COALESCE(excluded.provider, ${schema.sessions.provider})`,
          projectPath: sql`COALESCE(excluded.project_path, ${schema.sessions.projectPath})`,
          gitBranch: sql`COALESCE(excluded.git_branch, ${schema.sessions.gitBranch})`,
          startedAt: sql`COALESCE(excluded.started_at, ${schema.sessions.startedAt})`,
          lastActivityAt: sql`COALESCE(excluded.last_activity_at, ${schema.sessions.lastActivityAt})`,
          modelProvider: sql`COALESCE(excluded.model_provider, ${schema.sessions.modelProvider})`,
          providerMetadata: sql`COALESCE(excluded.provider_metadata, ${schema.sessions.providerMetadata})`,
        },
      })
      .run();
  } finally {
    sqlite.close();
  }
}

export function insertMessage(data: MessageData, dbPath?: string): number {
  const { db, sqlite } = getDb(dbPath);

  try {
    // Run migrations first
    migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

    db.insert(schema.messages)
      .values({
        sessionId: data.sessionId,
        provider: data.provider,
        messageUuid: data.messageUuid,
        parentUuid: data.parentUuid || null,
        role: data.role,
        content: data.content,
        model: data.model || null,
        stopReason: data.stopReason || null,
        isSidechain: data.isSidechain ? 1 : 0,
        agentId: data.agentId || null,
        timestamp: data.timestamp.toISOString(),
        inputTokens: data.inputTokens || null,
        outputTokens: data.outputTokens || null,
        cacheReadTokens: data.cacheReadTokens || null,
        cacheCreationTokens: data.cacheCreationTokens || null,
        reasoningTokens: data.reasoningTokens || null,
        providerMetadata: data.providerMetadata
          ? JSON.stringify(data.providerMetadata)
          : null,
      })
      .onConflictDoNothing()
      .run();

    // Get the message ID
    const result = db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.messageUuid, data.messageUuid))
      .get();

    return result?.id || 0;
  } finally {
    sqlite.close();
  }
}

export function insertToolCall(data: ToolCallData, dbPath?: string): void {
  const { db, sqlite } = getDb(dbPath);

  try {
    // Run migrations first
    migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

    db.insert(schema.toolCalls)
      .values({
        messageId: data.messageId,
        sessionId: data.sessionId,
        provider: data.provider,
        agentId: data.agentId || null,
        toolUseId: data.toolUseId,
        toolName: data.toolName,
        toolInput: data.toolInput,
        toolResult: data.toolResult || null,
        isError: data.isError ? 1 : 0,
        durationMs: data.durationMs || null,
        timestamp: data.timestamp.toISOString(),
        providerMetadata: data.providerMetadata
          ? JSON.stringify(data.providerMetadata)
          : null,
      })
      .onConflictDoNothing()
      .run();
  } finally {
    sqlite.close();
  }
}

export function upsertAgent(data: AgentData, dbPath?: string): void {
  const { db, sqlite } = getDb(dbPath);

  try {
    // Run migrations first
    migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

    db.insert(schema.agents)
      .values({
        agentId: data.agentId,
        sessionId: data.sessionId,
        provider: data.provider,
        parentMessageUuid: data.parentMessageUuid || null,
        subagentType: data.subagentType || null,
        prompt: data.prompt || null,
        status: data.status || null,
        model: data.model || null,
        totalDurationMs: data.totalDurationMs || null,
        totalTokens: data.totalTokens || null,
        totalToolCalls: data.totalToolCalls || null,
        startedAt: data.startedAt?.toISOString() || null,
        completedAt: data.completedAt?.toISOString() || null,
        providerMetadata: data.providerMetadata
          ? JSON.stringify(data.providerMetadata)
          : null,
      })
      .onConflictDoUpdate({
        target: schema.agents.agentId,
        set: {
          status: sql`COALESCE(excluded.status, ${schema.agents.status})`,
          totalDurationMs: sql`COALESCE(excluded.total_duration_ms, ${schema.agents.totalDurationMs})`,
          totalTokens: sql`COALESCE(excluded.total_tokens, ${schema.agents.totalTokens})`,
          totalToolCalls: sql`COALESCE(excluded.total_tool_calls, ${schema.agents.totalToolCalls})`,
          completedAt: sql`COALESCE(excluded.completed_at, ${schema.agents.completedAt})`,
          providerMetadata: sql`COALESCE(excluded.provider_metadata, ${schema.agents.providerMetadata})`,
        },
      })
      .run();
  } finally {
    sqlite.close();
  }
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
  const { db, sqlite } = getDb(dbPath);

  try {
    // Run migrations first
    migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

    // Use a transaction for atomicity
    sqlite.run("BEGIN TRANSACTION");

    try {
      // Insert session
      db.insert(schema.sessions)
        .values({
          sessionId: transcript.session.sessionId,
          provider: transcript.session.provider,
          projectPath: transcript.session.projectPath || null,
          gitBranch: transcript.session.gitBranch || null,
          startedAt: transcript.session.startedAt?.toISOString() || null,
          lastActivityAt:
            transcript.session.lastActivityAt?.toISOString() || null,
          modelProvider: transcript.session.modelProvider || null,
          providerMetadata: transcript.session.providerMetadata
            ? JSON.stringify(transcript.session.providerMetadata)
            : null,
        })
        .onConflictDoUpdate({
          target: schema.sessions.sessionId,
          set: {
            provider: sql`COALESCE(excluded.provider, ${schema.sessions.provider})`,
            projectPath: sql`COALESCE(excluded.project_path, ${schema.sessions.projectPath})`,
            gitBranch: sql`COALESCE(excluded.git_branch, ${schema.sessions.gitBranch})`,
            startedAt: sql`COALESCE(excluded.started_at, ${schema.sessions.startedAt})`,
            lastActivityAt: sql`COALESCE(excluded.last_activity_at, ${schema.sessions.lastActivityAt})`,
            modelProvider: sql`COALESCE(excluded.model_provider, ${schema.sessions.modelProvider})`,
            providerMetadata: sql`COALESCE(excluded.provider_metadata, ${schema.sessions.providerMetadata})`,
          },
        })
        .run();

      // Insert messages and build messageIdMap (UUID -> DB ID)
      const messageUuidToDbId = new Map<string, number>();
      for (const message of transcript.messages) {
        db.insert(schema.messages)
          .values({
            sessionId: message.sessionId,
            provider: message.provider,
            messageUuid: message.messageUuid,
            parentUuid: message.parentUuid || null,
            role: message.role,
            content: message.content,
            model: message.model || null,
            stopReason: message.stopReason || null,
            isSidechain: message.isSidechain ? 1 : 0,
            agentId: message.agentId || null,
            timestamp: message.timestamp.toISOString(),
            inputTokens: message.inputTokens || null,
            outputTokens: message.outputTokens || null,
            cacheReadTokens: message.cacheReadTokens || null,
            cacheCreationTokens: message.cacheCreationTokens || null,
            reasoningTokens: message.reasoningTokens || null,
            providerMetadata: message.providerMetadata
              ? JSON.stringify(message.providerMetadata)
              : null,
          })
          .onConflictDoNothing()
          .run();

        // Get the database ID for this message
        const result = db
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(eq(schema.messages.messageUuid, message.messageUuid))
          .get();

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
          console.error(
            `Warning: Could not find database message ID for tool call ${toolCall.toolUseId}, skipping`
          );
          continue;
        }

        db.insert(schema.toolCalls)
          .values({
            messageId: dbMessageId,
            sessionId: toolCall.sessionId,
            provider: toolCall.provider,
            agentId: toolCall.agentId || null,
            toolUseId: toolCall.toolUseId,
            toolName: toolCall.toolName,
            toolInput: toolCall.toolInput,
            toolResult: toolCall.toolResult || null,
            isError: toolCall.isError ? 1 : 0,
            durationMs: toolCall.durationMs || null,
            timestamp: toolCall.timestamp.toISOString(),
            providerMetadata: toolCall.providerMetadata
              ? JSON.stringify(toolCall.providerMetadata)
              : null,
          })
          .onConflictDoNothing()
          .run();
      }

      // Insert agents
      for (const agent of transcript.agents) {
        db.insert(schema.agents)
          .values({
            agentId: agent.agentId,
            sessionId: agent.sessionId,
            provider: agent.provider,
            parentMessageUuid: agent.parentMessageUuid || null,
            subagentType: agent.subagentType || null,
            prompt: agent.prompt || null,
            status: agent.status || null,
            model: agent.model || null,
            totalDurationMs: agent.totalDurationMs || null,
            totalTokens: agent.totalTokens || null,
            totalToolCalls: agent.totalToolCalls || null,
            startedAt: agent.startedAt?.toISOString() || null,
            completedAt: agent.completedAt?.toISOString() || null,
            providerMetadata: agent.providerMetadata
              ? JSON.stringify(agent.providerMetadata)
              : null,
          })
          .onConflictDoUpdate({
            target: schema.agents.agentId,
            set: {
              status: sql`COALESCE(excluded.status, ${schema.agents.status})`,
              totalDurationMs: sql`COALESCE(excluded.total_duration_ms, ${schema.agents.totalDurationMs})`,
              totalTokens: sql`COALESCE(excluded.total_tokens, ${schema.agents.totalTokens})`,
              totalToolCalls: sql`COALESCE(excluded.total_tool_calls, ${schema.agents.totalToolCalls})`,
              completedAt: sql`COALESCE(excluded.completed_at, ${schema.agents.completedAt})`,
              providerMetadata: sql`COALESCE(excluded.provider_metadata, ${schema.agents.providerMetadata})`,
            },
          })
          .run();
      }

      // Commit transaction
      sqlite.run("COMMIT");
    } catch (error) {
      // Rollback on error
      sqlite.run("ROLLBACK");
      throw error;
    }
  } finally {
    sqlite.close();
  }
}
