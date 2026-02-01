import type { ParsedTranscript, ParsedEvent } from './types'
import type { EventType } from '../schema'

// Hook payload sent by Gemini CLI
export interface GeminiHookPayload {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  timestamp: string
}

// Token usage structure
interface GeminiTokens {
  input: number
  output: number
  cached: number
  thoughts: number
  tool: number
  total: number
}

// Tool call structure
interface GeminiToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: Array<{ functionResponse: { output: string } }>
  status: 'success' | 'error'
  timestamp: string
}

// Message types in Gemini transcript
interface GeminiUserMessage {
  type: 'user'
  content: string
  timestamp: string
}

interface GeminiAssistantMessage {
  type: 'gemini'
  content: string
  toolCalls?: GeminiToolCall[]
  thoughts?: string
  tokens?: GeminiTokens
  model?: string
  timestamp: string
}

interface GeminiErrorMessage {
  type: 'error'
  content: string
  timestamp: string
}

interface GeminiInfoMessage {
  type: 'info'
  content: string
  timestamp: string
}

type GeminiMessage =
  | GeminiUserMessage
  | GeminiAssistantMessage
  | GeminiErrorMessage
  | GeminiInfoMessage

// Full transcript structure
interface GeminiTranscript {
  sessionId: string
  projectHash: string
  startTime: string
  lastUpdated: string
  messages: GeminiMessage[]
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

function extractFileInfo(toolName: string, args: Record<string, unknown>): FileInfo {
  switch (toolName) {
    case 'read_file': {
      const filePath = args.path ?? args.file_path ?? args.target
      if (typeof filePath === 'string') {
        return { file_path: filePath }
      }
      return {}
    }

    case 'write_file': {
      const filePath = args.path ?? args.file_path ?? args.target
      const content = args.content
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'update',
          file_lines_added: typeof content === 'string' ? countLines(content) : undefined,
        }
      }
      return {}
    }

    case 'replace': {
      // replace tool modifies existing files
      const filePath = args.path ?? args.file_path ?? args.target
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'update',
        }
      }
      return {}
    }

    case 'run_shell_command': {
      // directory is relative to project root
      const workdir = args.directory ?? args.workdir ?? args.cwd
      if (typeof workdir === 'string') {
        return { file_path: workdir }
      }
      return {}
    }

    case 'list_directory': {
      const dirPath = args.path ?? args.dir ?? args.directory
      if (typeof dirPath === 'string') {
        return { file_path: dirPath }
      }
      return {}
    }

    case 'glob': {
      // glob returns file paths matching pattern
      const pattern = args.pattern
      if (typeof pattern === 'string') {
        return { file_path: pattern }
      }
      return {}
    }

    case 'search_file_content': {
      const dirPath = args.path ?? args.directory
      if (typeof dirPath === 'string') {
        return { file_path: dirPath }
      }
      return {}
    }

    default:
      return {}
  }
}

export async function parseGeminiHookPayload(stdin: string): Promise<GeminiHookPayload | null> {
  try {
    return JSON.parse(stdin)
  } catch {
    return null
  }
}

export async function findGeminiTranscript(sessionId?: string): Promise<string | null> {
  const home = process.env.HOME ?? ''
  const geminiDir = `${home}/.gemini`

  // If session ID provided, search for matching file
  if (sessionId) {
    const { Glob } = await import('bun')
    const glob = new Glob(`**/session-*${sessionId}*.json`)
    for await (const file of glob.scan({ cwd: geminiDir, absolute: true })) {
      return file
    }
    return null
  }

  // Otherwise find the most recently modified transcript in tmp/*/chats/
  try {
    const { readdir, stat } = await import('node:fs/promises')
    const tmpDir = `${geminiDir}/tmp`

    const projectDirs = await readdir(tmpDir)
    let newestFile: { path: string; mtime: Date } | null = null

    for (const projectDir of projectDirs) {
      const chatsDir = `${tmpDir}/${projectDir}/chats`
      try {
        const files = await readdir(chatsDir)
        const jsonFiles = files.filter(f => f.startsWith('session-') && f.endsWith('.json'))

        for (const f of jsonFiles) {
          const path = `${chatsDir}/${f}`
          const s = await stat(path)
          if (!newestFile || s.mtime > newestFile.mtime) {
            newestFile = { path, mtime: s.mtime }
          }
        }
      } catch {
        // Skip directories without chats folder
      }
    }

    return newestFile?.path ?? null
  } catch {
    return null
  }
}

export async function parseGeminiTranscript(
  transcriptPath: string,
  hookPayload?: GeminiHookPayload
): Promise<ParsedTranscript> {
  const file = Bun.file(transcriptPath)
  const content = await file.text()

  // Gemini uses a single JSON object, not JSONL
  let transcript: GeminiTranscript
  try {
    transcript = JSON.parse(content)
  } catch {
    // Return empty transcript on parse failure
    return {
      source: 'gemini',
      session_id: hookPayload?.session_id ?? '',
      events: [],
    }
  }

  const events: ParsedEvent[] = []
  let turnIndex = 0
  const sessionId = hookPayload?.session_id ?? transcript.sessionId
  const sessionCwd = hookPayload?.cwd

  // Track first and last timestamps
  let firstTimestamp: string | undefined = transcript.startTime
  let lastTimestamp: string | undefined = transcript.lastUpdated

  for (const message of transcript.messages) {
    if (!message.timestamp) continue

    lastTimestamp = message.timestamp

    if (message.type === 'user') {
      // User prompt
      events.push(createParsedEvent({
        timestamp: message.timestamp,
        session_id: sessionId,
        event_type: 'prompt',
        cwd: sessionCwd,
        prompt_text: message.content,
      }))
    } else if (message.type === 'gemini') {
      // Assistant turn
      turnIndex++

      const tokens = message.tokens
      const promptTokens = tokens?.input
      const completionTokens = tokens?.output
      const totalTokens = tokens?.total

      events.push(createParsedEvent({
        timestamp: message.timestamp,
        session_id: sessionId,
        event_type: 'turn_end',
        turn_index: turnIndex,
        model: message.model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cwd: sessionCwd,
      }))

      // Extract tool calls
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          const fileInfo = extractFileInfo(toolCall.name, toolCall.args)
          events.push(createParsedEvent({
            timestamp: toolCall.timestamp || message.timestamp,
            session_id: sessionId,
            event_type: 'tool_call',
            turn_index: turnIndex,
            tool_name_raw: toolCall.name,
            tool_input: JSON.stringify(toolCall.args),
            file_path: fileInfo.file_path,
            file_action: fileInfo.file_action,
            file_lines_added: fileInfo.file_lines_added,
            file_lines_removed: fileInfo.file_lines_removed,
            cwd: sessionCwd,
          }))
        }
      }
    } else if (message.type === 'error') {
      // Error event
      events.push(createParsedEvent({
        timestamp: message.timestamp,
        session_id: sessionId,
        event_type: 'error',
        cwd: sessionCwd,
      }))
    }
    // Skip 'info' messages - they're just system info like auth
  }

  // Add session_start at the beginning
  if (sessionId && firstTimestamp) {
    events.unshift(createParsedEvent({
      timestamp: firstTimestamp,
      session_id: sessionId,
      event_type: 'session_start',
      cwd: sessionCwd,
    }))
  }

  // Add session_end at the end
  if (sessionId && lastTimestamp) {
    events.push(createParsedEvent({
      timestamp: lastTimestamp,
      session_id: sessionId,
      event_type: 'session_end',
      cwd: sessionCwd,
    }))
  }

  return {
    source: 'gemini',
    session_id: sessionId,
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
