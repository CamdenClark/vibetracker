import type { ParsedTranscript, ParsedEvent } from './types'
import type { EventType, ToolName } from '../schema'
import { homedir } from 'os'
import { join } from 'path'

/**
 * Cursor hook payload format based on Cursor docs
 * https://cursor.com/docs/agent/hooks
 */
export interface CursorHookPayload {
  conversation_id: string
  generation_id: string
  model: string
  hook_event_name: string
  cursor_version: string
  workspace_roots: string[]
  user_email: string | null
  transcript_path: string | null
}

interface CursorTranscriptEntry {
  type: string
  timestamp: string
  conversationId?: string
  message?: {
    role: string
    model?: string
    content?: unknown[]
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
}

interface FileInfo {
  file_path?: string
  file_action?: 'create' | 'update' | 'delete'
  file_lines_added?: number
  file_lines_removed?: number
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

function extractFileInfo(toolName: string, input: unknown): FileInfo {
  if (!input || typeof input !== 'object') return {}

  const inputObj = input as Record<string, unknown>

  // Cursor uses similar tool names to Claude Code
  switch (toolName) {
    case 'read_file':
    case 'Read': {
      const filePath = inputObj.file_path || inputObj.path
      if (typeof filePath === 'string') {
        return { file_path: filePath }
      }
      return {}
    }

    case 'write_file':
    case 'Write': {
      const filePath = inputObj.file_path || inputObj.path
      const content = inputObj.content
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'update',
          file_lines_added: typeof content === 'string' ? countLines(content) : undefined,
        }
      }
      return {}
    }

    case 'edit_file':
    case 'Edit':
    case 'MultiEdit': {
      const filePath = inputObj.file_path || inputObj.path
      const oldString = inputObj.old_string || inputObj.old_text
      const newString = inputObj.new_string || inputObj.new_text
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'update',
          file_lines_removed: typeof oldString === 'string' ? countLines(oldString) : undefined,
          file_lines_added: typeof newString === 'string' ? countLines(newString) : undefined,
        }
      }
      return {}
    }

    default:
      return {}
  }
}

export async function parseCursorHookPayload(stdin: string): Promise<CursorHookPayload> {
  return JSON.parse(stdin)
}

/**
 * Find the most recent Cursor transcript in the default location
 */
export async function findCursorTranscript(): Promise<string | null> {
  // Cursor stores transcripts in ~/.cursor/transcripts/ or workspace-local
  const transcriptDirs = [
    join(homedir(), '.cursor', 'transcripts'),
    join(homedir(), 'Library', 'Application Support', 'Cursor', 'transcripts'),
  ]

  for (const dir of transcriptDirs) {
    try {
      const glob = new Bun.Glob('**/*.jsonl')
      const files: { path: string; mtime: number }[] = []

      for await (const file of glob.scan({ cwd: dir, absolute: true })) {
        const stat = await Bun.file(file).stat()
        if (stat) {
          files.push({ path: file, mtime: stat.mtime.getTime() })
        }
      }

      if (files.length > 0) {
        // Return most recently modified
        files.sort((a, b) => b.mtime - a.mtime)
        return files[0]!.path
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  return null
}

export async function parseCursorTranscript(
  transcriptPath: string,
  hookPayload?: CursorHookPayload
): Promise<ParsedTranscript> {
  const file = Bun.file(transcriptPath)
  const content = await file.text()
  const lines = content.trim().split('\n').filter(Boolean)

  const events: ParsedEvent[] = []
  let turnIndex = 0
  let sessionId = hookPayload?.conversation_id
  let sessionCwd = hookPayload?.workspace_roots?.[0]

  // Track seen entries to avoid duplicates
  const seenTimestamps = new Set<string>()

  // Accumulate per turn
  let currentTurnInputTokens = 0
  let currentTurnModel: string | undefined = hookPayload?.model
  let currentTurnTimestamp: string | undefined
  let currentTurnToolCalls: Array<{ name: string; input: unknown; fileInfo: FileInfo }> = []

  const flushTurn = () => {
    if (currentTurnTimestamp && sessionId) {
      turnIndex++
      events.push(createParsedEvent({
        timestamp: currentTurnTimestamp,
        session_id: sessionId,
        event_type: 'turn_end',
        turn_index: turnIndex,
        model: currentTurnModel,
        prompt_tokens: currentTurnInputTokens || undefined,
      }))

      for (const tool of currentTurnToolCalls) {
        events.push(createParsedEvent({
          timestamp: currentTurnTimestamp,
          session_id: sessionId,
          event_type: 'tool_call',
          turn_index: turnIndex,
          tool_name: normalizeToolName(tool.name),
          tool_name_raw: tool.name,
          tool_input: JSON.stringify(tool.input),
          file_path: tool.fileInfo.file_path,
          file_action: tool.fileInfo.file_action,
          file_lines_added: tool.fileInfo.file_lines_added,
          file_lines_removed: tool.fileInfo.file_lines_removed,
        }))
      }
    }
    currentTurnInputTokens = 0
    currentTurnModel = hookPayload?.model
    currentTurnTimestamp = undefined
    currentTurnToolCalls = []
  }

  for (const line of lines) {
    let entry: CursorTranscriptEntry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    if (!entry.timestamp) continue

    sessionId ??= entry.conversationId

    // Dedupe by timestamp
    const key = `${entry.type}:${entry.timestamp}`
    if (seenTimestamps.has(key)) continue
    seenTimestamps.add(key)

    if (entry.type === 'user' && entry.message?.role === 'user') {
      flushTurn()

      const content = entry.message.content

      // Skip tool_result messages
      if (Array.isArray(content) && content.some((block: any) => block?.type === 'tool_result')) {
        continue
      }

      const promptText = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? (content.find((block: any) => block?.type === 'text') as { text?: string } | undefined)?.text
          : undefined

      events.push(createParsedEvent({
        timestamp: entry.timestamp,
        session_id: sessionId ?? '',
        event_type: 'prompt',
        cwd: sessionCwd,
        prompt_text: promptText,
      }))
    } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
      const hasContent = entry.message.content?.some((block: any) =>
        block.type === 'text' || block.type === 'tool_use'
      )

      if (!hasContent) continue

      const usage = entry.message.usage
      if (usage) {
        currentTurnInputTokens = Math.max(
          currentTurnInputTokens,
          (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        )
      }

      currentTurnModel ??= entry.message.model
      currentTurnTimestamp = entry.timestamp

      const messageContent = entry.message.content
      if (Array.isArray(messageContent)) {
        for (const block of messageContent) {
          if (block && typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
            const toolBlock = block as { type: 'tool_use'; name: string; input: unknown }
            const fileInfo = extractFileInfo(toolBlock.name, toolBlock.input)
            currentTurnToolCalls.push({ name: toolBlock.name, input: toolBlock.input, fileInfo })
          }
        }
      }
    }
  }

  flushTurn()

  return {
    source: 'cursor',
    session_id: sessionId ?? '',
    events,
  }
}

function createParsedEvent(params: {
  timestamp: string
  session_id: string
  event_type: EventType
  cwd?: string
  git_branch?: string
  turn_index?: number
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  tool_name?: string
  tool_name_raw?: string
  tool_input?: string
  file_path?: string
  file_action?: 'create' | 'update' | 'delete'
  file_lines_added?: number
  file_lines_removed?: number
  prompt_text?: string
}): ParsedEvent {
  return {
    timestamp: params.timestamp,
    session_id: params.session_id,
    event_type: params.event_type,
    cwd: params.cwd,
    git_branch: params.git_branch,
    turn_index: params.turn_index,
    model: params.model,
    prompt_tokens: params.prompt_tokens,
    completion_tokens: params.completion_tokens,
    total_tokens: params.total_tokens,
    tool_name_raw: params.tool_name_raw,
    tool_input: params.tool_input,
    file_path: params.file_path,
    file_action: params.file_action,
    file_lines_added: params.file_lines_added,
    file_lines_removed: params.file_lines_removed,
    prompt_text: params.prompt_text,
  }
}

// Cursor uses a mix of Claude-style and custom tool names
const CURSOR_TOOL_MAP: Record<string, ToolName> = {
  // Claude-style names
  Bash: 'bash',
  Read: 'file_read',
  Write: 'file_write',
  Edit: 'file_edit',
  MultiEdit: 'file_edit',
  Grep: 'grep',
  Glob: 'glob',
  ListDir: 'list_dir',
  WebFetch: 'web_fetch',
  WebSearch: 'web_search',
  Task: 'task',
  // Cursor-specific names
  read_file: 'file_read',
  write_file: 'file_write',
  edit_file: 'file_edit',
  run_terminal_command: 'bash',
  terminal: 'bash',
  search_files: 'grep',
  list_directory: 'list_dir',
  codebase_search: 'grep',
  file_search: 'glob',
}

export function normalizeToolName(rawName: string): ToolName {
  return CURSOR_TOOL_MAP[rawName] ?? 'other'
}
