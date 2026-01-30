import type { ParsedTranscript, ParsedEvent } from './types'
import type { EventType } from '../schema'
import { parseGitRepoFromUrl } from '../cache'

// Hook payload sent by Codex CLI
export interface CodexHookPayload {
  session_id: string
  transcript_path: string
  cwd: string
}

// Session metadata entry
interface CodexSessionMeta {
  type: 'session_meta'
  timestamp: string
  payload: {
    id: string
    timestamp: string
    cwd: string
    originator: string
    cli_version: string
    instructions: string | null
    source: string
    model_provider: string
    git?: {
      commit_hash: string
      branch: string
      repository_url: string
    }
  }
}

// Response item entry (messages, function calls, outputs)
interface CodexResponseItem {
  type: 'response_item'
  timestamp: string
  payload: {
    type: string
    role?: string
    content?: Array<{ type: string; text?: string }>
    name?: string
    arguments?: string
    call_id?: string
    output?: string
  }
}

// Event message entry
interface CodexEventMsg {
  type: 'event_msg'
  timestamp: string
  payload: {
    type: string
    message?: string
    reason?: string
    text?: string
    info?: {
      total_token_usage?: {
        input_tokens: number
        cached_input_tokens: number
        output_tokens: number
        reasoning_output_tokens: number
        total_tokens: number
      }
    }
  }
}

// Turn context entry
interface CodexTurnContext {
  type: 'turn_context'
  timestamp: string
  payload: {
    cwd: string
    approval_policy: string
    model: string
  }
}

type CodexTranscriptEntry = CodexSessionMeta | CodexResponseItem | CodexEventMsg | CodexTurnContext | { type: string; timestamp: string; payload: unknown }

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
      const filePath = args.path ?? args.file_path
      if (typeof filePath === 'string') {
        return { file_path: filePath }
      }
      return {}
    }

    case 'write_file': {
      const filePath = args.path ?? args.file_path
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

    case 'patch_file': {
      const filePath = args.path ?? args.file_path
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'update',
        }
      }
      return {}
    }

    case 'delete_file': {
      const filePath = args.path ?? args.file_path
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'delete',
        }
      }
      return {}
    }

    case 'shell_command': {
      const workdir = args.workdir
      if (typeof workdir === 'string') {
        return { file_path: workdir }
      }
      return {}
    }

    default:
      return {}
  }
}

export async function parseCodexHookPayload(stdin: string): Promise<CodexHookPayload> {
  return JSON.parse(stdin)
}

export async function findCodexTranscript(sessionId?: string): Promise<string | null> {
  const home = process.env.HOME ?? ''
  const sessionsDir = `${home}/.codex/sessions`

  // If session ID provided, search for matching file
  if (sessionId) {
    const { Glob } = await import('bun')
    const glob = new Glob(`**/*${sessionId}*.jsonl`)
    for await (const file of glob.scan({ cwd: sessionsDir, absolute: true })) {
      return file
    }
    return null
  }

  // Otherwise find the most recently modified transcript
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const todayDir = `${sessionsDir}/${year}/${month}/${day}`

  try {
    const { readdir, stat } = await import('node:fs/promises')
    const files = await readdir(todayDir)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

    if (jsonlFiles.length === 0) return null

    // Sort by modification time, newest first
    const withStats = await Promise.all(
      jsonlFiles.map(async f => {
        const path = `${todayDir}/${f}`
        const s = await stat(path)
        return { path, mtime: s.mtime }
      })
    )
    withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    return withStats[0]?.path ?? null
  } catch {
    return null
  }
}

export async function parseCodexTranscript(
  transcriptPath: string,
  hookPayload?: CodexHookPayload
): Promise<ParsedTranscript> {
  const file = Bun.file(transcriptPath)
  const content = await file.text()
  const lines = content.trim().split('\n').filter(Boolean)

  const events: ParsedEvent[] = []
  let turnIndex = 0
  let sessionId = hookPayload?.session_id
  let sessionCwd = hookPayload?.cwd
  let sessionGitBranch: string | undefined
  let sessionGitRepo: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  // Track current turn state
  let currentTurnModel: string | undefined
  let currentTurnTimestamp: string | undefined
  let currentTurnInputTokens = 0
  let currentTurnOutputTokens = 0
  let currentTurnToolCalls: Array<{ name: string; args: Record<string, unknown>; fileInfo: FileInfo; timestamp: string }> = []
  let hasPendingAssistantMessage = false

  // Track function calls awaiting output by call_id
  const pendingFunctionCalls = new Map<string, { name: string; args: Record<string, unknown> }>()

  const flushTurn = () => {
    if (currentTurnTimestamp && sessionId && hasPendingAssistantMessage) {
      turnIndex++
      events.push(createParsedEvent({
        timestamp: currentTurnTimestamp,
        session_id: sessionId,
        event_type: 'turn_end',
        turn_index: turnIndex,
        model: currentTurnModel,
        prompt_tokens: currentTurnInputTokens || undefined,
        completion_tokens: currentTurnOutputTokens || undefined,
        total_tokens: (currentTurnInputTokens + currentTurnOutputTokens) || undefined,
        cwd: sessionCwd,
        git_branch: sessionGitBranch,
        git_repo: sessionGitRepo,
      }))

      // Add tool calls for this turn
      for (const tool of currentTurnToolCalls) {
        events.push(createParsedEvent({
          timestamp: tool.timestamp,
          session_id: sessionId,
          event_type: 'tool_call',
          turn_index: turnIndex,
          tool_name_raw: tool.name,
          tool_input: JSON.stringify(tool.args),
          file_path: tool.fileInfo.file_path,
          file_action: tool.fileInfo.file_action,
          file_lines_added: tool.fileInfo.file_lines_added,
          file_lines_removed: tool.fileInfo.file_lines_removed,
          cwd: sessionCwd,
          git_branch: sessionGitBranch,
          git_repo: sessionGitRepo,
        }))
      }
    }
    // Reset accumulators
    currentTurnModel = undefined
    currentTurnTimestamp = undefined
    currentTurnInputTokens = 0
    currentTurnOutputTokens = 0
    currentTurnToolCalls = []
    hasPendingAssistantMessage = false
  }

  for (const line of lines) {
    const entry: CodexTranscriptEntry = JSON.parse(line)

    if (!entry.timestamp) continue

    firstTimestamp ??= entry.timestamp
    lastTimestamp = entry.timestamp

    if (entry.type === 'session_meta') {
      const meta = entry as CodexSessionMeta
      sessionId ??= meta.payload.id
      sessionCwd ??= meta.payload.cwd
      sessionGitBranch ??= meta.payload.git?.branch
      if (!sessionGitRepo && meta.payload.git?.repository_url) {
        sessionGitRepo = parseGitRepoFromUrl(meta.payload.git.repository_url)
      }
    } else if (entry.type === 'turn_context') {
      const ctx = entry as CodexTurnContext
      currentTurnModel = ctx.payload.model
      sessionCwd ??= ctx.payload.cwd
    } else if (entry.type === 'event_msg') {
      const msg = entry as CodexEventMsg

      if (msg.payload.type === 'user_message') {
        // Flush any pending turn before processing new user message
        flushTurn()

        if (sessionId) {
          events.push(createParsedEvent({
            timestamp: entry.timestamp,
            session_id: sessionId,
            event_type: 'prompt',
            cwd: sessionCwd,
            git_branch: sessionGitBranch,
            git_repo: sessionGitRepo,
            prompt_text: msg.payload.message,
          }))
        }
      } else if (msg.payload.type === 'agent_message') {
        hasPendingAssistantMessage = true
        currentTurnTimestamp = entry.timestamp
      } else if (msg.payload.type === 'token_count' && msg.payload.info?.total_token_usage) {
        const usage = msg.payload.info.total_token_usage
        // Take the max since token counts accumulate
        currentTurnInputTokens = Math.max(
          currentTurnInputTokens,
          usage.input_tokens + usage.cached_input_tokens
        )
        currentTurnOutputTokens = Math.max(
          currentTurnOutputTokens,
          usage.output_tokens + usage.reasoning_output_tokens
        )
      } else if (msg.payload.type === 'turn_aborted') {
        // Turn was interrupted, flush what we have
        flushTurn()
      }
    } else if (entry.type === 'response_item') {
      const item = entry as CodexResponseItem

      if (item.payload.type === 'function_call') {
        const name = item.payload.name ?? ''
        const callId = item.payload.call_id ?? ''
        let args: Record<string, unknown> = {}

        try {
          args = JSON.parse(item.payload.arguments ?? '{}')
        } catch {
          args = {}
        }

        pendingFunctionCalls.set(callId, { name, args })

        const fileInfo = extractFileInfo(name, args)
        currentTurnToolCalls.push({ name, args, fileInfo, timestamp: entry.timestamp })
        currentTurnTimestamp = entry.timestamp
        hasPendingAssistantMessage = true
      } else if (item.payload.type === 'function_call_output') {
        // Tool output received - can update file info if needed
        const callId = item.payload.call_id ?? ''
        pendingFunctionCalls.delete(callId)
      } else if (item.payload.type === 'message' && item.payload.role === 'assistant') {
        hasPendingAssistantMessage = true
        currentTurnTimestamp = entry.timestamp
      }
    }
  }

  // Flush any remaining turn
  flushTurn()

  // Add session_start at the beginning
  if (sessionId && firstTimestamp) {
    events.unshift(createParsedEvent({
      timestamp: firstTimestamp,
      session_id: sessionId,
      event_type: 'session_start',
      cwd: sessionCwd,
      git_branch: sessionGitBranch,
      git_repo: sessionGitRepo,
    }))
  }

  // Add session_end at the end
  if (sessionId && lastTimestamp) {
    events.push(createParsedEvent({
      timestamp: lastTimestamp,
      session_id: sessionId,
      event_type: 'session_end',
      cwd: sessionCwd,
      git_branch: sessionGitBranch,
      git_repo: sessionGitRepo,
    }))
  }

  return {
    source: 'codex',
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
  git_repo?: string
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
    git_repo: params.git_repo,
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
