import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseClaudeHookPayload,
  parseClaudeTranscript,
  parseClaudeSubagentTranscript,
  isSubagentStopPayload,
  type ClaudePayload,
} from './claude'

describe('isSubagentStopPayload', () => {
  test('returns true for valid SubagentStop payload', () => {
    const payload: ClaudePayload = {
      session_id: 'sess-123',
      transcript_path: '/path/to/transcript.jsonl',
      agent_id: 'agent-456',
      agent_transcript_path: '/path/to/agent-transcript.jsonl',
      hook_event_name: 'SubagentStop',
      cwd: '/home/user/project',
    }
    expect(isSubagentStopPayload(payload)).toBe(true)
  })

  test('returns false for regular hook payload', () => {
    const payload: ClaudePayload = {
      session_id: 'sess-123',
      transcript_path: '/path/to/transcript.jsonl',
      hook_event_name: 'Stop',
      cwd: '/home/user/project',
    }
    expect(isSubagentStopPayload(payload)).toBe(false)
  })

  test('returns false when missing agent_id', () => {
    const payload = {
      session_id: 'sess-123',
      transcript_path: '/path/to/transcript.jsonl',
      agent_transcript_path: '/path/to/agent-transcript.jsonl',
      hook_event_name: 'SubagentStop',
      cwd: '/home/user/project',
    } as ClaudePayload
    expect(isSubagentStopPayload(payload)).toBe(false)
  })

  test('returns false when missing agent_transcript_path', () => {
    const payload = {
      session_id: 'sess-123',
      transcript_path: '/path/to/transcript.jsonl',
      agent_id: 'agent-456',
      hook_event_name: 'SubagentStop',
      cwd: '/home/user/project',
    } as ClaudePayload
    expect(isSubagentStopPayload(payload)).toBe(false)
  })
})

describe('parseClaudeHookPayload', () => {
  test('parses valid JSON payload', async () => {
    const stdin = JSON.stringify({
      session_id: 'sess-123',
      transcript_path: '/path/to/transcript.jsonl',
      cwd: '/home/user/project',
      hook_event_name: 'Stop',
    })

    const payload = await parseClaudeHookPayload(stdin)
    expect(payload!.session_id).toBe('sess-123')
    expect(payload!.transcript_path).toBe('/path/to/transcript.jsonl')
    expect(payload!.cwd).toBe('/home/user/project')
    expect(payload!.hook_event_name).toBe('Stop')
  })

  test('returns null on invalid JSON', async () => {
    const result = await parseClaudeHookPayload('not valid json')
    expect(result).toBeNull()
  })
})

describe('parseClaudeTranscript', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-test-'))
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('parses empty transcript', async () => {
    const transcriptPath = join(tempDir, 'empty.jsonl')
    await Bun.write(transcriptPath, '')

    const result = await parseClaudeTranscript(transcriptPath)
    expect(result.source).toBe('claude_code')
    expect(result.events).toEqual([])
  })

  test('parses transcript with single user prompt', async () => {
    const transcriptPath = join(tempDir, 'single-prompt.jsonl')
    const entry = {
      type: 'user',
      timestamp: '2024-01-15T10:00:00Z',
      sessionId: 'sess-abc',
      uuid: 'uuid-1',
      cwd: '/home/user/project',
      gitBranch: 'main',
      message: {
        role: 'user',
        content: 'Hello, Claude!',
      },
    }
    await Bun.write(transcriptPath, JSON.stringify(entry))

    const result = await parseClaudeTranscript(transcriptPath)
    expect(result.session_id).toBe('sess-abc')
    expect(result.events.length).toBe(1)

    const prompt = result.events[0]
    expect(prompt).toBeDefined()
    expect(prompt!.event_type).toBe('prompt')
    expect(prompt!.session_id).toBe('sess-abc')
    expect(prompt!.cwd).toBe('/home/user/project')
    expect(prompt!.git_branch).toBe('main')
    expect(prompt!.prompt_text).toBe('Hello, Claude!')
  })

  test('parses transcript with user prompt and assistant response', async () => {
    const transcriptPath = join(tempDir, 'prompt-response.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        cwd: '/home/user/project',
        message: {
          role: 'user',
          content: 'What is 2+2?',
        },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: '2+2 equals 4.' }],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 2,
          },
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    expect(result.events.length).toBe(2) // prompt, turn_end

    const turnEnd = result.events.find((e) => e.event_type === 'turn_end')
    expect(turnEnd).toBeDefined()
    expect(turnEnd!.turn_index).toBe(1)
    expect(turnEnd!.model).toBe('claude-3-5-sonnet-20241022')
    expect(turnEnd!.prompt_tokens).toBe(12) // 10 + 2 cache_read
  })

  test('deduplicates streaming chunks by UUID', async () => {
    const transcriptPath = join(tempDir, 'streaming.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Test' },
      },
      // Simulated streaming chunks with same UUID
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 5, output_tokens: 1 },
        },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:02Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2', // Same UUID = streaming chunk
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, world!' }],
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    // Should only have 1 turn_end despite 2 assistant entries with same UUID
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')
    expect(turnEnds.length).toBe(1)
  })

  test('extracts tool calls from assistant content', async () => {
    const transcriptPath = join(tempDir, 'tool-calls.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Read the file' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read that file.' },
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/path/to/file.ts' },
            },
          ],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('Read')
    expect(toolCall!.file_path).toBe('/path/to/file.ts')
  })

  test('extracts file info from Write tool', async () => {
    const transcriptPath = join(tempDir, 'write-tool.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Write a file' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: {
                file_path: '/path/to/new-file.ts',
                content: 'line 1\nline 2\nline 3',
              },
            },
          ],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('Write')
    expect(toolCall!.file_path).toBe('/path/to/new-file.ts')
    expect(toolCall!.file_action).toBe('update')
    expect(toolCall!.file_lines_added).toBe(3)
  })

  test('extracts file info from Edit tool', async () => {
    const transcriptPath = join(tempDir, 'edit-tool.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Edit a file' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: {
                file_path: '/path/to/file.ts',
                old_string: 'old line 1\nold line 2',
                new_string: 'new line 1\nnew line 2\nnew line 3',
              },
            },
          ],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('Edit')
    expect(toolCall!.file_path).toBe('/path/to/file.ts')
    expect(toolCall!.file_action).toBe('update')
    expect(toolCall!.file_lines_removed).toBe(2)
    expect(toolCall!.file_lines_added).toBe(3)
  })

  test('handles multiple turns correctly', async () => {
    const transcriptPath = join(tempDir, 'multi-turn.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'First prompt' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'First response' }],
        },
      },
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:02Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-3',
        message: { role: 'user', content: 'Second prompt' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:03Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-4',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Second response' }],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')

    expect(prompts.length).toBe(2)
    expect(turnEnds.length).toBe(2)
    expect(turnEnds[0]!.turn_index).toBe(1)
    expect(turnEnds[1]!.turn_index).toBe(2)
  })

  test('skips entries without content', async () => {
    const transcriptPath = join(tempDir, 'no-content.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Test' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'Just thinking...' }], // Only thinking, no text
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')
    expect(turnEnds.length).toBe(0) // No turn_end because assistant had no real content
  })

  test('skips tool_result messages as prompts', async () => {
    const transcriptPath = join(tempDir, 'tool-result.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Read a file' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Read', input: { file_path: '/test.ts' } },
          ],
        },
      },
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:02Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-3',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents here' },
          ],
        },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:03Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-4',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'I read the file' }],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    expect(prompts.length).toBe(1) // Only the real user prompt, not the tool_result
    expect(prompts[0]!.prompt_text).toBe('Read a file')
  })

  test('uses hookPayload session_id when available', async () => {
    const transcriptPath = join(tempDir, 'hook-payload.jsonl')
    const entry = {
      type: 'user',
      timestamp: '2024-01-15T10:00:00Z',
      sessionId: 'sess-from-transcript',
      uuid: 'uuid-1',
      message: { role: 'user', content: 'Test' },
    }
    await Bun.write(transcriptPath, JSON.stringify(entry))

    const hookPayload = {
      session_id: 'sess-from-hook',
      transcript_path: transcriptPath,
      cwd: '/hook/cwd',
      hook_event_name: 'Stop',
    }

    const result = await parseClaudeTranscript(transcriptPath, hookPayload)
    expect(result.session_id).toBe('sess-from-hook')
  })

  test('accumulates input tokens correctly with cache tokens', async () => {
    const transcriptPath = join(tempDir, 'cache-tokens.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Test' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 10,
          },
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const turnEnd = result.events.find((e) => e.event_type === 'turn_end')
    expect(turnEnd!.prompt_tokens).toBe(130) // 100 + 20 + 10
  })

  test('extracts prompt_text from array content with text blocks', async () => {
    const transcriptPath = join(tempDir, 'array-text-content.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: '[Request interrupted by user]' },
          ],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    expect(prompts.length).toBe(1)
    expect(prompts[0]!.prompt_text).toBe('[Request interrupted by user]')
  })

  test('creates separate turns for each assistant response', async () => {
    const transcriptPath = join(tempDir, 'multi-turn-tools.jsonl')
    const entries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Do multiple things' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }],
          usage: { input_tokens: 100 },
        },
      },
      // Tool result triggers turn flush
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:02Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-3',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file content' }],
        },
      },
      // New turn starts
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:03Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-4',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/b.ts', content: 'new' } }],
          usage: { input_tokens: 150 },
        },
      },
      // Another tool result triggers turn flush
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:04Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-5',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'ok' }],
        },
      },
      // Final turn
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:05Z',
        sessionId: 'sess-abc',
        uuid: 'uuid-6',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done!' }],
          usage: { input_tokens: 200 },
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseClaudeTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')
    const toolCalls = result.events.filter((e) => e.event_type === 'tool_call')

    // Only 1 real prompt (tool_results are skipped)
    expect(prompts.length).toBe(1)
    // Each assistant response is a separate turn (flushed on tool_result)
    expect(turnEnds.length).toBe(3)
    expect(turnEnds[0]!.turn_index).toBe(1)
    expect(turnEnds[1]!.turn_index).toBe(2)
    expect(turnEnds[2]!.turn_index).toBe(3)
    // Each turn has its own token count
    expect(turnEnds[0]!.prompt_tokens).toBe(100)
    expect(turnEnds[1]!.prompt_tokens).toBe(150)
    expect(turnEnds[2]!.prompt_tokens).toBe(200)
    // Tool calls are associated with their turns
    expect(toolCalls.length).toBe(2)
    expect(toolCalls[0]!.turn_index).toBe(1)
    expect(toolCalls[1]!.turn_index).toBe(2)
  })
})

describe('parseClaudeSubagentTranscript', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-subagent-test-'))
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('parses subagent transcript with agent_id', async () => {
    const agentTranscriptPath = join(tempDir, 'agent.jsonl')
    const parentTranscriptPath = join(tempDir, 'parent.jsonl')

    // Parent transcript with Task tool call
    const parentEntries = [
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-parent',
        uuid: 'uuid-parent-1',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              input: { subagent_type: 'Explore', prompt: 'Find files' },
            },
          ],
        },
      },
    ]

    // Agent transcript
    const agentEntries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-parent',
        uuid: 'uuid-agent-1',
        message: { role: 'user', content: 'Find files matching *.ts' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:02Z',
        sessionId: 'sess-parent',
        uuid: 'uuid-agent-2',
        message: {
          role: 'assistant',
          model: 'claude-3-5-haiku-20241022',
          content: [
            { type: 'text', text: 'Found files' },
            { type: 'tool_use', name: 'Glob', input: { pattern: '*.ts' } },
          ],
          usage: { input_tokens: 50, output_tokens: 20 },
        },
      },
    ]

    await Bun.write(parentTranscriptPath, parentEntries.map((e) => JSON.stringify(e)).join('\n'))
    await Bun.write(agentTranscriptPath, agentEntries.map((e) => JSON.stringify(e)).join('\n'))

    const payload = {
      session_id: 'sess-parent',
      transcript_path: parentTranscriptPath,
      agent_id: 'agent-123',
      agent_transcript_path: agentTranscriptPath,
      hook_event_name: 'SubagentStop' as const,
      cwd: '/home/user/project',
    }

    const result = await parseClaudeSubagentTranscript(payload)

    expect(result.session_id).toBe('sess-parent')
    expect(result.source).toBe('claude_code')

    // Check events have agent_id and agent_type
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('Glob')
    expect(toolCall!.agent_id).toBe('agent-123')
    expect(toolCall!.agent_type).toBe('Explore')

    const prompt = result.events.find((e) => e.event_type === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.agent_id).toBe('agent-123')
    expect(prompt!.agent_type).toBe('Explore')
  })

  test('handles missing parent transcript gracefully', async () => {
    const agentTranscriptPath = join(tempDir, 'agent-no-parent.jsonl')

    const agentEntries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:01Z',
        sessionId: 'sess-parent',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Test' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:02Z',
        sessionId: 'sess-parent',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
        },
      },
    ]

    await Bun.write(agentTranscriptPath, agentEntries.map((e) => JSON.stringify(e)).join('\n'))

    const payload = {
      session_id: 'sess-parent',
      transcript_path: '/nonexistent/parent.jsonl',
      agent_id: 'agent-123',
      agent_transcript_path: agentTranscriptPath,
      hook_event_name: 'SubagentStop' as const,
      cwd: '/home/user/project',
    }

    const result = await parseClaudeSubagentTranscript(payload)

    // Should still parse, just without agent_type
    expect(result.events.length).toBeGreaterThan(0)
    const prompt = result.events.find((e) => e.event_type === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.agent_id).toBe('agent-123')
    expect(prompt!.agent_type).toBeUndefined()
  })

  test('skips tool_result messages as prompts in subagent', async () => {
    const agentTranscriptPath = join(tempDir, 'agent-tool-results.jsonl')
    const parentTranscriptPath = join(tempDir, 'parent-tool-results.jsonl')

    const parentEntries = [
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:00Z',
        sessionId: 'sess-parent',
        uuid: 'uuid-parent-1',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Task', input: { subagent_type: 'Explore' } },
          ],
        },
      },
    ]

    const agentEntries = [
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:01Z',
        uuid: 'uuid-1',
        message: { role: 'user', content: 'Find all tests' },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:02Z',
        uuid: 'uuid-2',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '*.test.ts' } }],
        },
      },
      // Tool result - should be skipped
      {
        type: 'user',
        timestamp: '2024-01-15T10:00:03Z',
        uuid: 'uuid-3',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file1.test.ts\nfile2.test.ts' }],
        },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-15T10:00:04Z',
        uuid: 'uuid-4',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Found 2 test files' }],
        },
      },
    ]

    await Bun.write(parentTranscriptPath, parentEntries.map((e) => JSON.stringify(e)).join('\n'))
    await Bun.write(agentTranscriptPath, agentEntries.map((e) => JSON.stringify(e)).join('\n'))

    const payload = {
      session_id: 'sess-parent',
      transcript_path: parentTranscriptPath,
      agent_id: 'agent-123',
      agent_transcript_path: agentTranscriptPath,
      hook_event_name: 'SubagentStop' as const,
      cwd: '/home/user/project',
    }

    const result = await parseClaudeSubagentTranscript(payload)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')

    // Only 1 real prompt, tool_result is skipped
    expect(prompts.length).toBe(1)
    expect(prompts[0]!.prompt_text).toBe('Find all tests')
  })
})
