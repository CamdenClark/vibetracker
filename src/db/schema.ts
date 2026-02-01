import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  user_id: text('user_id').notNull(),
  team_id: text('team_id'),
  machine_id: text('machine_id'),
  session_id: text('session_id').notNull(),
  event_type: text('event_type').notNull(),
  source: text('source').notNull(),

  session_cwd: text('session_cwd'),
  session_git_repo: text('session_git_repo'),
  session_git_branch: text('session_git_branch'),
  session_duration_ms: integer('session_duration_ms'),

  turn_index: integer('turn_index'),
  prompt_tokens: integer('prompt_tokens'),
  completion_tokens: integer('completion_tokens'),
  total_tokens: integer('total_tokens'),
  model: text('model'),

  tool_name: text('tool_name'),
  tool_name_raw: text('tool_name_raw'),
  tool_input: text('tool_input'),
  tool_output: text('tool_output'),
  tool_duration_ms: integer('tool_duration_ms'),
  tool_success: integer('tool_success'),

  mcp_server: text('mcp_server'),
  mcp_tool_name: text('mcp_tool_name'),

  file_path: text('file_path'),
  file_action: text('file_action'),
  file_lines_added: integer('file_lines_added'),
  file_lines_removed: integer('file_lines_removed'),

  error_message: text('error_message'),
  error_code: text('error_code'),

  prompt_text: text('prompt_text'),

  agent_id: text('agent_id'),
  agent_type: text('agent_type'),

  meta: text('meta'),
  synced_at: text('synced_at'),
}, (table) => [
  // Note: idx_events_dedup is created via raw SQL in the migration
  // because Drizzle doesn't support COALESCE expressions in indexes
  index('idx_events_timestamp').on(table.timestamp),
  index('idx_events_session').on(table.session_id),
  index('idx_events_synced').on(table.synced_at),
  index('idx_events_agent').on(table.agent_id),
])
