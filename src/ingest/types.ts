import type { EventType, AgentSource } from '../schema'

// Parsed event from any source (no identity fields)
export interface ParsedEvent {
  timestamp: string
  event_type: EventType
  session_id: string

  // Context
  cwd?: string
  git_branch?: string

  // Turn data
  turn_index?: number
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number

  // Tool data
  tool_name_raw?: string
  tool_input?: string

  // Prompt data
  prompt_text?: string

  // Subagent data
  agent_id?: string
  agent_type?: string
}

// Result from parsing a transcript
export interface ParsedTranscript {
  source: AgentSource
  session_id: string
  events: ParsedEvent[]
}
