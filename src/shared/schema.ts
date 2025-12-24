import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Sessions table
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").unique().notNull(),
    provider: text("provider").notNull(),
    projectPath: text("project_path"),
    gitBranch: text("git_branch"),
    startedAt: text("started_at"),
    lastActivityAt: text("last_activity_at"),
    modelProvider: text("model_provider"),
    providerMetadata: text("provider_metadata"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_sessions_session_id").on(table.sessionId)]
);

// Messages table
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.sessionId),
    provider: text("provider").notNull(),
    messageUuid: text("message_uuid").unique().notNull(),
    parentUuid: text("parent_uuid"),
    role: text("role").notNull(),
    content: text("content"),
    model: text("model"),
    stopReason: text("stop_reason"),
    isSidechain: integer("is_sidechain").default(0),
    agentId: text("agent_id"),
    timestamp: text("timestamp"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheCreationTokens: integer("cache_creation_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    providerMetadata: text("provider_metadata"),
  },
  (table) => [
    index("idx_messages_session_id").on(table.sessionId),
    index("idx_messages_uuid").on(table.messageUuid),
    index("idx_messages_parent").on(table.parentUuid),
    index("idx_messages_agent").on(table.agentId),
    index("idx_messages_timestamp").on(table.timestamp),
  ]
);

// Tool calls table
export const toolCalls = sqliteTable(
  "tool_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.sessionId),
    provider: text("provider").notNull(),
    agentId: text("agent_id"),
    toolUseId: text("tool_use_id").unique().notNull(),
    toolName: text("tool_name").notNull(),
    toolInput: text("tool_input"),
    toolResult: text("tool_result"),
    isError: integer("is_error").default(0),
    durationMs: integer("duration_ms"),
    timestamp: text("timestamp"),
    providerMetadata: text("provider_metadata"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_tool_calls_tool_name").on(table.toolName),
    index("idx_tool_calls_session").on(table.sessionId),
    index("idx_tool_calls_agent").on(table.agentId),
    index("idx_tool_calls_timestamp").on(table.timestamp),
  ]
);

// Agents table
export const agents = sqliteTable(
  "agents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: text("agent_id").unique().notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.sessionId),
    provider: text("provider").notNull(),
    parentMessageUuid: text("parent_message_uuid"),
    subagentType: text("subagent_type"),
    prompt: text("prompt"),
    status: text("status"),
    model: text("model"),
    totalDurationMs: integer("total_duration_ms"),
    totalTokens: integer("total_tokens"),
    totalToolCalls: integer("total_tool_calls"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    providerMetadata: text("provider_metadata"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_agents_agent_id").on(table.agentId),
    index("idx_agents_session").on(table.sessionId),
    index("idx_agents_type").on(table.subagentType),
  ]
);
