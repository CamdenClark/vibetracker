import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseGeminiHookPayload,
  parseGeminiTranscript,
} from './gemini'

describe('parseGeminiHookPayload', () => {
  test('parses valid JSON payload', async () => {
    const stdin = JSON.stringify({
      session_id: 'session-abc123',
      transcript_path: '/path/to/transcript.json',
      cwd: '/home/user/project',
      hook_event_name: 'SessionEnd',
      timestamp: '2025-01-15T10:00:00Z',
    })

    const payload = await parseGeminiHookPayload(stdin)
    expect(payload.session_id).toBe('session-abc123')
    expect(payload.transcript_path).toBe('/path/to/transcript.json')
    expect(payload.cwd).toBe('/home/user/project')
    expect(payload.hook_event_name).toBe('SessionEnd')
  })

  test('returns null on invalid JSON', async () => {
    const result = await parseGeminiHookPayload('not valid json')
    expect(result).toBeNull()
  })
})

describe('parseGeminiTranscript', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gemini-test-'))
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('parses empty transcript', async () => {
    const transcriptPath = join(tempDir, 'empty.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-empty',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:00:00Z',
      messages: [],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    expect(result.source).toBe('gemini')
    expect(result.session_id).toBe('session-empty')
    // Should have session_start and session_end
    expect(result.events.length).toBe(2)
    expect(result.events[0]!.event_type).toBe('session_start')
    expect(result.events[1]!.event_type).toBe('session_end')
  })

  test('parses single user message', async () => {
    const transcriptPath = join(tempDir, 'user-only.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-user',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:01:00Z',
      messages: [
        {
          type: 'user',
          content: 'Hello, how are you?',
          timestamp: '2025-01-15T10:00:30Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    expect(result.source).toBe('gemini')
    expect(result.session_id).toBe('session-user')

    const prompt = result.events.find((e) => e.event_type === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.prompt_text).toBe('Hello, how are you?')
  })

  test('parses user + assistant messages', async () => {
    const transcriptPath = join(tempDir, 'conversation.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-conv',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'What is the capital of France?',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'The capital of France is Paris.',
          model: 'gemini-2.0-flash-001',
          tokens: {
            input: 100,
            output: 50,
            cached: 0,
            thoughts: 0,
            tool: 0,
            total: 150,
          },
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    expect(result.session_id).toBe('session-conv')

    const prompt = result.events.find((e) => e.event_type === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.prompt_text).toBe('What is the capital of France?')

    const turnEnd = result.events.find((e) => e.event_type === 'turn_end')
    expect(turnEnd).toBeDefined()
    expect(turnEnd!.model).toBe('gemini-2.0-flash-001')
    expect(turnEnd!.prompt_tokens).toBe(100)
    expect(turnEnd!.completion_tokens).toBe(50)
    expect(turnEnd!.total_tokens).toBe(150)
    expect(turnEnd!.turn_index).toBe(1)
  })

  test('parses tool calls', async () => {
    const transcriptPath = join(tempDir, 'tool-calls.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-tools',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'List files in the current directory',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Here are the files in the directory.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'list_directory',
              args: { path: '/home/user/project' },
              result: [{ functionResponse: { output: 'file1.ts\nfile2.ts' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          tokens: {
            input: 100,
            output: 50,
            cached: 0,
            thoughts: 0,
            tool: 10,
            total: 160,
          },
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('list_directory')
    expect(toolCall!.file_path).toBe('/home/user/project')
    expect(toolCall!.turn_index).toBe(1)

    const input = JSON.parse(toolCall!.tool_input!)
    expect(input.path).toBe('/home/user/project')
  })

  test('parses run_shell_command tool', async () => {
    const transcriptPath = join(tempDir, 'shell-command.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-shell',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Run ls command',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Here is the output.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'run_shell_command',
              args: { command: 'ls -la', directory: '/home/user/project' },
              result: [{ functionResponse: { output: 'file1.ts' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('run_shell_command')
    expect(toolCall!.file_path).toBe('/home/user/project')
  })

  test('parses write_file tool', async () => {
    const transcriptPath = join(tempDir, 'write-file.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-write',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Create a test file',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Created the file.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'write_file',
              args: {
                path: '/home/user/project/test.ts',
                content: 'line1\nline2\nline3',
              },
              result: [{ functionResponse: { output: 'success' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('write_file')
    expect(toolCall!.file_path).toBe('/home/user/project/test.ts')
    expect(toolCall!.file_action).toBe('update')
    expect(toolCall!.file_lines_added).toBe(3)
  })

  test('parses multiple turns', async () => {
    const transcriptPath = join(tempDir, 'multi-turn.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-multi',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:05:00Z',
      messages: [
        {
          type: 'user',
          content: 'First question',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'First answer',
          model: 'gemini-2.0-flash-001',
          timestamp: '2025-01-15T10:01:00Z',
        },
        {
          type: 'user',
          content: 'Second question',
          timestamp: '2025-01-15T10:02:00Z',
        },
        {
          type: 'gemini',
          content: 'Second answer',
          model: 'gemini-2.0-flash-001',
          timestamp: '2025-01-15T10:03:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')

    expect(prompts.length).toBe(2)
    expect(prompts[0]!.prompt_text).toBe('First question')
    expect(prompts[1]!.prompt_text).toBe('Second question')

    expect(turnEnds.length).toBe(2)
    expect(turnEnds[0]!.turn_index).toBe(1)
    expect(turnEnds[1]!.turn_index).toBe(2)
  })

  test('handles error messages', async () => {
    const transcriptPath = join(tempDir, 'error.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-error',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:01:00Z',
      messages: [
        {
          type: 'user',
          content: 'Do something',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'error',
          content: 'Something went wrong',
          timestamp: '2025-01-15T10:00:45Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const errorEvent = result.events.find((e) => e.event_type === 'error')
    expect(errorEvent).toBeDefined()
  })

  test('skips info messages', async () => {
    const transcriptPath = join(tempDir, 'info.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-info',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:01:00Z',
      messages: [
        {
          type: 'info',
          content: 'Authenticated successfully',
          timestamp: '2025-01-15T10:00:10Z',
        },
        {
          type: 'user',
          content: 'Hello',
          timestamp: '2025-01-15T10:00:30Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    // Should only have session_start, prompt, session_end
    expect(result.events.length).toBe(3)
    expect(result.events[0]!.event_type).toBe('session_start')
    expect(result.events[1]!.event_type).toBe('prompt')
    expect(result.events[2]!.event_type).toBe('session_end')
  })

  test('uses hookPayload session_id when available', async () => {
    const transcriptPath = join(tempDir, 'hook-payload.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-from-transcript',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:01:00Z',
      messages: [],
    }))

    const hookPayload = {
      session_id: 'session-from-hook',
      transcript_path: transcriptPath,
      cwd: '/hook/cwd',
      hook_event_name: 'SessionEnd',
      timestamp: '2025-01-15T10:01:00Z',
    }

    const result = await parseGeminiTranscript(transcriptPath, hookPayload)
    expect(result.session_id).toBe('session-from-hook')
  })

  test('parses replace tool for file edits', async () => {
    const transcriptPath = join(tempDir, 'replace-tool.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-replace',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Fix the bug',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Fixed the bug.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'replace',
              args: {
                path: '/home/user/project/src/main.ts',
                old: 'console.log("bug")',
                new: 'console.log("fix")',
              },
              result: [{ functionResponse: { output: 'success' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('replace')
    expect(toolCall!.file_path).toBe('/home/user/project/src/main.ts')
    expect(toolCall!.file_action).toBe('update')
  })

  test('parses read_file tool', async () => {
    const transcriptPath = join(tempDir, 'read-file.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-read',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Show me the file',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Here is the content.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'read_file',
              args: { path: '/home/user/project/src/index.ts' },
              result: [{ functionResponse: { output: 'content here' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('read_file')
    expect(toolCall!.file_path).toBe('/home/user/project/src/index.ts')
  })

  test('parses search_file_content tool', async () => {
    const transcriptPath = join(tempDir, 'search.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-search',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Search for TODO comments',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Found some TODOs.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'search_file_content',
              args: { pattern: 'TODO:', path: '/home/user/project/src' },
              result: [{ functionResponse: { output: 'match1\nmatch2' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('search_file_content')
    expect(toolCall!.file_path).toBe('/home/user/project/src')
  })

  test('parses glob tool', async () => {
    const transcriptPath = join(tempDir, 'glob.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-glob',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Find all TypeScript files',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Found the files.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'glob',
              args: { pattern: '**/*.ts' },
              result: [{ functionResponse: { output: '/home/user/project/src/index.ts' } }],
              status: 'success',
              timestamp: '2025-01-15T10:00:45Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('glob')
    expect(toolCall!.file_path).toBe('**/*.ts')
  })

  test('handles multiple tool calls in single turn', async () => {
    const transcriptPath = join(tempDir, 'multi-tools.json')
    await Bun.write(transcriptPath, JSON.stringify({
      sessionId: 'session-multi-tools',
      projectHash: 'abc123',
      startTime: '2025-01-15T10:00:00Z',
      lastUpdated: '2025-01-15T10:02:00Z',
      messages: [
        {
          type: 'user',
          content: 'Read and update the file',
          timestamp: '2025-01-15T10:00:30Z',
        },
        {
          type: 'gemini',
          content: 'Done.',
          model: 'gemini-2.0-flash-001',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'read_file',
              args: { path: '/home/user/project/test.ts' },
              status: 'success',
              timestamp: '2025-01-15T10:00:40Z',
            },
            {
              id: 'tool-2',
              name: 'write_file',
              args: { path: '/home/user/project/test.ts', content: 'updated' },
              status: 'success',
              timestamp: '2025-01-15T10:00:50Z',
            },
          ],
          timestamp: '2025-01-15T10:01:00Z',
        },
      ],
    }))

    const result = await parseGeminiTranscript(transcriptPath)
    const toolCalls = result.events.filter((e) => e.event_type === 'tool_call')
    expect(toolCalls.length).toBe(2)
    expect(toolCalls[0]!.tool_name_raw).toBe('read_file')
    expect(toolCalls[1]!.tool_name_raw).toBe('write_file')
    // Both should have same turn_index
    expect(toolCalls[0]!.turn_index).toBe(1)
    expect(toolCalls[1]!.turn_index).toBe(1)
  })
})
