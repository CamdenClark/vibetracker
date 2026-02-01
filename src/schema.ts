export type EventType =
  | 'session_start'
  | 'session_end'
  | 'prompt'
  | 'turn_start'
  | 'turn_end'
  | 'tool_call'
  | 'error'

export type ToolName =
  | 'bash'
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'file_delete'
  | 'grep'
  | 'glob'
  | 'list_dir'
  | 'web_fetch'
  | 'web_search'
  | 'task'
  | 'mcp_tool'
  | 'other'

export type AgentSource =
  | 'claude_code'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'cursor'
  | 'other'

export interface VibeEvent {
  id: string
  timestamp: string
  user_id: string
  team_id?: string
  machine_id?: string
  session_id: string
  event_type: EventType
  source: AgentSource

  session_cwd?: string
  session_git_repo?: string
  session_git_branch?: string
  session_duration_ms?: number

  turn_index?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  model?: string

  tool_name?: ToolName
  tool_name_raw?: string
  tool_input?: string
  tool_output?: string
  tool_duration_ms?: number
  tool_success?: boolean

  mcp_server?: string
  mcp_tool_name?: string

  file_path?: string
  file_action?: 'create' | 'update' | 'delete'
  file_lines_added?: number
  file_lines_removed?: number

  bash_command?: string
  bash_command_output?: string

  error_message?: string
  error_code?: string

  prompt_text?: string

  // Subagent fields
  agent_id?: string
  agent_type?: string

  meta?: Record<string, unknown>
  synced_at?: string
}
