import type { VibeEvent, EventType } from '../schema'
import type { Config } from '../config'
import { normalizeToolName } from '../normalize'

interface ClaudeHookPayload {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  reason?: string
}

interface ClaudeTranscriptEntry {
  type: string
  timestamp: string
  sessionId: string
  uuid: string
  cwd?: string
  gitBranch?: string
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

export async function parseClaudeHookPayload(stdin: string): Promise<ClaudeHookPayload> {
  return JSON.parse(stdin)
}

export async function ingestClaudeTranscript(
  transcriptPath: string,
  config: Config,
  hookPayload?: ClaudeHookPayload
): Promise<VibeEvent[]> {
  const file = Bun.file(transcriptPath)
  const content = await file.text()
  const lines = content.trim().split('\n').filter(Boolean)

  const events: VibeEvent[] = []
  let turnIndex = 0
  let sessionId = hookPayload?.session_id
  let sessionCwd = hookPayload?.cwd
  let sessionGitBranch: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  for (const line of lines) {
    const entry: ClaudeTranscriptEntry = JSON.parse(line)

    // Skip non-message entries
    if (!entry.sessionId || !entry.timestamp) continue

    sessionId ??= entry.sessionId
    sessionCwd ??= entry.cwd
    sessionGitBranch ??= entry.gitBranch
    firstTimestamp ??= entry.timestamp
    lastTimestamp = entry.timestamp

    if (entry.type === 'user' && entry.message?.role === 'user') {
      events.push(createEvent({
        timestamp: entry.timestamp,
        session_id: sessionId,
        event_type: 'prompt',
        config,
        session_cwd: sessionCwd,
        session_git_branch: sessionGitBranch,
      }))
    } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
      // Only count turns with actual content (not just thinking blocks or streaming partials)
      const hasContent = entry.message.content?.some((block: any) =>
        block.type === 'text' || block.type === 'tool_use'
      )

      if (!hasContent) continue

      turnIndex++

      const usage = entry.message.usage
      const inputTokens = usage
        ? (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        : undefined
      const outputTokens = usage?.output_tokens

      events.push(createEvent({
        timestamp: entry.timestamp,
        session_id: sessionId,
        event_type: 'turn_end',
        config,
        turn_index: turnIndex,
        model: entry.message.model,
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : undefined,
      }))

      // Extract tool calls from content
      const content = entry.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && 'type' in block) {
            if (block.type === 'tool_use') {
              const toolBlock = block as { type: 'tool_use'; name: string; input: unknown }
              events.push(createEvent({
                timestamp: entry.timestamp,
                session_id: sessionId,
                event_type: 'tool_call',
                config,
                turn_index: turnIndex,
                tool_name: normalizeToolName(toolBlock.name, 'claude_code'),
                tool_name_raw: toolBlock.name,
                tool_input: JSON.stringify(toolBlock.input),
              }))
            }
          }
        }
      }
    }
  }

  // Add session_start at the beginning
  if (sessionId && firstTimestamp) {
    events.unshift(createEvent({
      timestamp: firstTimestamp,
      session_id: sessionId,
      event_type: 'session_start',
      config,
      session_cwd: sessionCwd,
      session_git_branch: sessionGitBranch,
    }))
  }

  // Add session_end at the end
  if (sessionId && lastTimestamp) {
    events.push(createEvent({
      timestamp: lastTimestamp,
      session_id: sessionId,
      event_type: 'session_end',
      config,
      session_cwd: sessionCwd,
      session_git_branch: sessionGitBranch,
    }))
  }

  return events
}

function createEvent(params: {
  timestamp: string
  session_id: string
  event_type: EventType
  config: Config
  session_cwd?: string
  session_git_branch?: string
  turn_index?: number
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  tool_name?: string
  tool_name_raw?: string
  tool_input?: string
}): VibeEvent {
  return {
    id: generateUUIDv7(),
    timestamp: params.timestamp,
    user_id: params.config.user_id,
    team_id: params.config.team_id,
    machine_id: params.config.machine_id,
    session_id: params.session_id,
    event_type: params.event_type,
    source: 'claude_code',
    session_cwd: params.session_cwd,
    session_git_branch: params.session_git_branch,
    turn_index: params.turn_index,
    model: params.model,
    prompt_tokens: params.prompt_tokens,
    completion_tokens: params.completion_tokens,
    total_tokens: params.total_tokens,
    tool_name: params.tool_name as VibeEvent['tool_name'],
    tool_name_raw: params.tool_name_raw,
    tool_input: params.tool_input,
  }
}

function generateUUIDv7(): string {
  const timestamp = Date.now()
  const timestampHex = timestamp.toString(16).padStart(12, '0')

  const randomBytes = crypto.getRandomValues(new Uint8Array(10))
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // UUIDv7 format: tttttttt-tttt-7xxx-yxxx-xxxxxxxxxxxx
  return [
    timestampHex.slice(0, 8),
    timestampHex.slice(8, 12),
    '7' + randomHex.slice(0, 3),
    ((parseInt(randomHex.slice(3, 4), 16) & 0x3f) | 0x80).toString(16) + randomHex.slice(4, 7),
    randomHex.slice(7, 19),
  ].join('-')
}
