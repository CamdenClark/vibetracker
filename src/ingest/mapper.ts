import type { VibeEvent } from '../schema'
import type { Config } from '../config'
import type { ParsedTranscript, ParsedEvent } from './types'
import { getGitRepo } from '../cache'

export async function mapToVibeEvents(parsed: ParsedTranscript, config: Config): Promise<VibeEvent[]> {
  // Look up git repo from cache if not in transcript and we have a cwd
  let cachedGitRepo: string | null = null
  const firstEventWithCwd = parsed.events.find(e => e.cwd)
  if (firstEventWithCwd?.cwd && !parsed.events.some(e => e.git_repo)) {
    cachedGitRepo = await getGitRepo(firstEventWithCwd.cwd)
  }

  return parsed.events.map(event => mapEventToVibeEvent(event, parsed.source, config, cachedGitRepo))
}

function mapEventToVibeEvent(
  event: ParsedEvent,
  source: ParsedTranscript['source'],
  config: Config,
  cachedGitRepo: string | null
): VibeEvent {
  const vibeEvent: VibeEvent = {
    id: generateUUIDv7(),
    timestamp: event.timestamp,
    user_id: config.user_id,
    team_id: config.team_id,
    machine_id: config.machine_id,
    session_id: event.session_id,
    event_type: event.event_type,
    source: source,

    session_cwd: event.cwd,
    session_git_repo: event.git_repo ?? cachedGitRepo ?? undefined,
    session_git_branch: event.git_branch,

    turn_index: event.turn_index,
    model: event.model,
    prompt_tokens: event.prompt_tokens,
    completion_tokens: event.completion_tokens,
    total_tokens: event.total_tokens,

    tool_name: event.tool_name,
    tool_name_raw: event.tool_name_raw,
    tool_input: event.tool_input,

    file_path: event.file_path,
    file_action: event.file_action,
    file_lines_added: event.file_lines_added,
    file_lines_removed: event.file_lines_removed,

    prompt_text: event.prompt_text,

    agent_id: event.agent_id,
    agent_type: event.agent_type,
  }

  return vibeEvent
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
