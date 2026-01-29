import type { ParsedTranscript, ParsedEvent } from './types'
import type { EventType } from '../schema'

interface ClaudeHookPayload {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  reason?: string
}

interface ClaudeSubagentStopPayload {
  session_id: string
  transcript_path: string
  agent_id: string
  agent_transcript_path: string
  hook_event_name: 'SubagentStop'
  cwd: string
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

export type ClaudePayload = ClaudeHookPayload | ClaudeSubagentStopPayload

export function isSubagentStopPayload(payload: ClaudePayload): payload is ClaudeSubagentStopPayload {
  return payload.hook_event_name === 'SubagentStop' && 'agent_id' in payload && 'agent_transcript_path' in payload
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

  switch (toolName) {
    case 'Read': {
      const filePath = inputObj.file_path
      if (typeof filePath === 'string') {
        return { file_path: filePath }
      }
      return {}
    }

    case 'Write': {
      const filePath = inputObj.file_path
      const content = inputObj.content
      if (typeof filePath === 'string') {
        return {
          file_path: filePath,
          file_action: 'update', // Could be create or update, we can't tell
          file_lines_added: typeof content === 'string' ? countLines(content) : undefined,
        }
      }
      return {}
    }

    case 'Edit':
    case 'MultiEdit': {
      const filePath = inputObj.file_path
      const oldString = inputObj.old_string
      const newString = inputObj.new_string
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

export async function parseClaudeHookPayload(stdin: string): Promise<ClaudePayload> {
  return JSON.parse(stdin)
}

export async function parseClaudeTranscript(
  transcriptPath: string,
  hookPayload?: ClaudeHookPayload
): Promise<ParsedTranscript> {
  const file = Bun.file(transcriptPath)
  const content = await file.text()
  const lines = content.trim().split('\n').filter(Boolean)

  const events: ParsedEvent[] = []
  let turnIndex = 0
  let sessionId = hookPayload?.session_id
  let sessionCwd = hookPayload?.cwd
  let sessionGitBranch: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  // Track seen UUIDs to avoid duplicate processing of streaming chunks
  const seenUuids = new Set<string>()
  // Accumulate per turn (between user prompts)
  // NOTE: output_tokens from Claude Code transcripts are unreliable (shows streaming deltas, not totals)
  // so we only track input tokens
  let currentTurnInputTokens = 0
  let currentTurnModel: string | undefined
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
        // completion_tokens omitted - Claude Code transcripts don't have accurate output token counts
      }))

      // Add tool calls for this turn
      for (const tool of currentTurnToolCalls) {
        events.push(createParsedEvent({
          timestamp: currentTurnTimestamp,
          session_id: sessionId,
          event_type: 'tool_call',
          turn_index: turnIndex,
          tool_name_raw: tool.name,
          tool_input: JSON.stringify(tool.input),
          file_path: tool.fileInfo.file_path,
          file_action: tool.fileInfo.file_action,
          file_lines_added: tool.fileInfo.file_lines_added,
          file_lines_removed: tool.fileInfo.file_lines_removed,
        }))
      }
    }
    // Reset accumulators
    currentTurnInputTokens = 0
    currentTurnModel = undefined
    currentTurnTimestamp = undefined
    currentTurnToolCalls = []
  }

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
      // Flush any pending assistant turn before processing user prompt
      flushTurn()

      // Extract prompt text from user message content
      const promptText = typeof entry.message.content === 'string'
        ? entry.message.content
        : undefined

      events.push(createParsedEvent({
        timestamp: entry.timestamp,
        session_id: sessionId,
        event_type: 'prompt',
        cwd: sessionCwd,
        git_branch: sessionGitBranch,
        prompt_text: promptText,
      }))
    } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
      // Skip already-processed streaming chunks
      if (seenUuids.has(entry.uuid)) continue
      seenUuids.add(entry.uuid)

      // Only count entries with actual content (not just thinking blocks)
      const hasContent = entry.message.content?.some((block: any) =>
        block.type === 'text' || block.type === 'tool_use'
      )

      if (!hasContent) continue

      // Accumulate input tokens (take max since streaming chunks have same cumulative value)
      const usage = entry.message.usage
      if (usage) {
        currentTurnInputTokens = Math.max(
          currentTurnInputTokens,
          (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        )
      }

      currentTurnModel ??= entry.message.model
      currentTurnTimestamp = entry.timestamp

      // Collect tool calls from content
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
    }))
  }

  return {
    source: 'claude_code',
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
  tool_name_raw?: string
  tool_input?: string
  file_path?: string
  file_action?: 'create' | 'update' | 'delete'
  file_lines_added?: number
  file_lines_removed?: number
  prompt_text?: string
  agent_id?: string
  agent_type?: string
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
    agent_id: params.agent_id,
    agent_type: params.agent_type,
  }
}

export async function parseClaudeSubagentTranscript(
  payload: ClaudeSubagentStopPayload
): Promise<ParsedTranscript> {
  const file = Bun.file(payload.agent_transcript_path)
  const content = await file.text()
  const lines = content.trim().split('\n').filter(Boolean)

  // Extract agent_type from parent transcript
  const agentType = await extractAgentTypeFromParentTranscript(
    payload.transcript_path,
    payload.agent_id
  )

  const events: ParsedEvent[] = []
  let turnIndex = 0
  let sessionCwd = payload.cwd
  let sessionGitBranch: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  for (const line of lines) {
    const entry: ClaudeTranscriptEntry = JSON.parse(line)

    // Skip non-message entries
    if (!entry.timestamp) continue

    sessionGitBranch ??= entry.gitBranch
    firstTimestamp ??= entry.timestamp
    lastTimestamp = entry.timestamp

    if (entry.type === 'user' && entry.message?.role === 'user') {
      // Extract prompt text from user message content
      const promptText = typeof entry.message.content === 'string'
        ? entry.message.content
        : undefined

      events.push(createParsedEvent({
        timestamp: entry.timestamp,
        session_id: payload.session_id,
        event_type: 'prompt',
        cwd: sessionCwd,
        git_branch: sessionGitBranch,
        prompt_text: promptText,
        agent_id: payload.agent_id,
        agent_type: agentType,
      }))
    } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
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

      events.push(createParsedEvent({
        timestamp: entry.timestamp,
        session_id: payload.session_id,
        event_type: 'turn_end',
        turn_index: turnIndex,
        model: entry.message.model,
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : undefined,
        agent_id: payload.agent_id,
        agent_type: agentType,
      }))

      // Extract tool calls from content
      const content = entry.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && 'type' in block) {
            if (block.type === 'tool_use') {
              const toolBlock = block as { type: 'tool_use'; name: string; input: unknown }
              const fileInfo = extractFileInfo(toolBlock.name, toolBlock.input)
              events.push(createParsedEvent({
                timestamp: entry.timestamp,
                session_id: payload.session_id,
                event_type: 'tool_call',
                turn_index: turnIndex,
                tool_name_raw: toolBlock.name,
                tool_input: JSON.stringify(toolBlock.input),
                file_path: fileInfo.file_path,
                file_action: fileInfo.file_action,
                file_lines_added: fileInfo.file_lines_added,
                file_lines_removed: fileInfo.file_lines_removed,
                agent_id: payload.agent_id,
                agent_type: agentType,
              }))
            }
          }
        }
      }
    }
  }

  // Add session_start for the subagent at the beginning
  if (firstTimestamp) {
    events.unshift(createParsedEvent({
      timestamp: firstTimestamp,
      session_id: payload.session_id,
      event_type: 'session_start',
      cwd: sessionCwd,
      git_branch: sessionGitBranch,
      agent_id: payload.agent_id,
      agent_type: agentType,
    }))
  }

  // Add session_end for the subagent at the end
  if (lastTimestamp) {
    events.push(createParsedEvent({
      timestamp: lastTimestamp,
      session_id: payload.session_id,
      event_type: 'session_end',
      cwd: sessionCwd,
      git_branch: sessionGitBranch,
      agent_id: payload.agent_id,
      agent_type: agentType,
    }))
  }

  return {
    source: 'claude_code',
    session_id: payload.session_id,
    events,
  }
}

async function extractAgentTypeFromParentTranscript(
  transcriptPath: string,
  agentId: string
): Promise<string | undefined> {
  try {
    const file = Bun.file(transcriptPath)
    const content = await file.text()
    const lines = content.trim().split('\n').filter(Boolean)

    for (const line of lines) {
      const entry: ClaudeTranscriptEntry = JSON.parse(line)

      if (entry.type !== 'assistant' || entry.message?.role !== 'assistant') continue

      const messageContent = entry.message.content
      if (!Array.isArray(messageContent)) continue

      for (const block of messageContent) {
        if (block && typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
          const toolBlock = block as { type: 'tool_use'; name: string; input: Record<string, unknown> }

          // Look for Task tool calls
          if (toolBlock.name === 'Task') {
            const input = toolBlock.input
            // Check if this Task call's result mentions our agent_id
            // The subagent_type is in the input
            const subagentType = input.subagent_type as string | undefined

            // We need to match this Task to our agent. The agent_id format is typically
            // something like "agent-abc123" where abc123 might relate to the task
            // For now, we scan for any Task tool with the matching subagent_type
            // since we can't directly match agent_id to tool_use_id
            if (subagentType) {
              return subagentType
            }
          }
        }
      }
    }
  } catch {
    // If we can't read the parent transcript, return undefined
  }

  return undefined
}
