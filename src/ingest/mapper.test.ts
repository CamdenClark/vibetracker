import { test, expect, describe, mock, beforeEach } from 'bun:test'
import { mapToVibeEvents } from './mapper'
import type { ParsedTranscript } from './types'
import type { Config } from '../config'

// Mock getGitRepo to avoid actual git/gh calls
const mockGetGitRepo = mock((): Promise<string | null> => Promise.resolve(null))
mock.module('../cache', () => ({
  getGitRepo: mockGetGitRepo,
}))

const testConfig: Config = {
  user_id: 'test-user',
  team_id: 'test-team',
  machine_id: 'test-machine',
}

describe('mapToVibeEvents', () => {
  beforeEach(() => {
    mockGetGitRepo.mockReset()
    mockGetGitRepo.mockResolvedValue(null)
  })

  test('maps basic event fields', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'session_start',
          session_id: 'test-session',
          cwd: '/test/path',
          git_branch: 'main',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events).toHaveLength(1)
    expect(events[0]!.timestamp).toBe('2024-01-01T00:00:00Z')
    expect(events[0]!.event_type).toBe('session_start')
    expect(events[0]!.session_id).toBe('test-session')
    expect(events[0]!.user_id).toBe('test-user')
    expect(events[0]!.team_id).toBe('test-team')
    expect(events[0]!.machine_id).toBe('test-machine')
    expect(events[0]!.source).toBe('claude_code')
    expect(events[0]!.session_cwd).toBe('/test/path')
    expect(events[0]!.session_git_branch).toBe('main')
  })

  test('uses git_repo from event when provided', async () => {
    const parsed: ParsedTranscript = {
      source: 'codex',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'session_start',
          session_id: 'test-session',
          cwd: '/test/path',
          git_repo: 'owner/repo',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.session_git_repo).toBe('owner/repo')
    expect(mockGetGitRepo).not.toHaveBeenCalled()
  })

  test('looks up git_repo from cache when not in event', async () => {
    mockGetGitRepo.mockResolvedValue('cached/repo')

    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'session_start',
          session_id: 'test-session',
          cwd: '/test/path',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.session_git_repo).toBe('cached/repo')
    expect(mockGetGitRepo).toHaveBeenCalledWith('/test/path')
  })

  test('does not look up cache when event has git_repo', async () => {
    mockGetGitRepo.mockResolvedValue('cached/repo')

    const parsed: ParsedTranscript = {
      source: 'codex',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'session_start',
          session_id: 'test-session',
          cwd: '/test/path',
          git_repo: 'event/repo',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.session_git_repo).toBe('event/repo')
    expect(mockGetGitRepo).not.toHaveBeenCalled()
  })

  test('handles missing cwd gracefully', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'session_start',
          session_id: 'test-session',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.session_git_repo).toBeUndefined()
    expect(mockGetGitRepo).not.toHaveBeenCalled()
  })

  test('normalizes tool names', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'tool_call',
          session_id: 'test-session',
          tool_name: 'file_read',
          tool_name_raw: 'Read',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.tool_name).toBe('file_read')
    expect(events[0]!.tool_name_raw).toBe('Read')
  })

  test('generates unique UUIDv7 ids', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'session_start',
          session_id: 'test-session',
        },
        {
          timestamp: '2024-01-01T00:00:01Z',
          event_type: 'session_end',
          session_id: 'test-session',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.id).toBeDefined()
    expect(events[1]!.id).toBeDefined()
    expect(events[0]!.id).not.toBe(events[1]!.id)
    // Check it looks like a UUID (contains hyphens and hex chars)
    expect(events[0]!.id).toMatch(/^[0-9a-f-]+$/)
  })

  test('maps file operation fields', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'tool_call',
          session_id: 'test-session',
          tool_name: 'file_write',
          tool_name_raw: 'Write',
          file_path: '/test/file.ts',
          file_action: 'create',
          file_lines_added: 10,
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.file_path).toBe('/test/file.ts')
    expect(events[0]!.file_action).toBe('create')
    expect(events[0]!.file_lines_added).toBe(10)
  })

  test('maps prompt_text field', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'prompt',
          session_id: 'test-session',
          prompt_text: 'Fix the bug',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.prompt_text).toBe('Fix the bug')
  })

  test('maps subagent fields', async () => {
    const parsed: ParsedTranscript = {
      source: 'claude_code',
      session_id: 'test-session',
      events: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event_type: 'tool_call',
          session_id: 'test-session',
          agent_id: 'agent-123',
          agent_type: 'Explore',
        },
      ],
    }

    const events = await mapToVibeEvents(parsed, testConfig)

    expect(events[0]!.agent_id).toBe('agent-123')
    expect(events[0]!.agent_type).toBe('Explore')
  })
})
