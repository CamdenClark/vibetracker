import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseCodexHookPayload,
  parseCodexTranscript,
} from './codex'

describe('parseCodexHookPayload', () => {
  test('parses valid JSON payload', async () => {
    const stdin = JSON.stringify({
      session_id: 'sess-123',
      transcript_path: '/path/to/transcript.jsonl',
      cwd: '/home/user/project',
    })

    const payload = await parseCodexHookPayload(stdin)
    expect(payload!.session_id).toBe('sess-123')
    expect(payload!.transcript_path).toBe('/path/to/transcript.jsonl')
    expect(payload!.cwd).toBe('/home/user/project')
  })

  test('returns null on invalid JSON', async () => {
    const result = await parseCodexHookPayload('not valid json')
    expect(result).toBeNull()
  })
})

describe('parseCodexTranscript', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codex-test-'))
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('parses empty transcript', async () => {
    const transcriptPath = join(tempDir, 'empty.jsonl')
    await Bun.write(transcriptPath, '')

    const result = await parseCodexTranscript(transcriptPath)
    expect(result.source).toBe('codex')
    expect(result.events).toEqual([])
  })

  test('extracts session metadata from session_meta entry', async () => {
    const transcriptPath = join(tempDir, 'session-meta.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: {
          id: '019aacfe-694c-7810-9cd3-8983125d7af8',
          timestamp: '2025-11-22T19:15:45.612Z',
          cwd: '/Users/camdenclark/vibetracker',
          originator: 'codex_cli_rs',
          cli_version: '0.63.0',
          instructions: null,
          source: 'cli',
          model_provider: 'openai',
          git: {
            commit_hash: 'ebd1e0593955c901147e22fdfe14e4c487c572f9',
            branch: 'main',
            repository_url: 'git@github.com:CamdenClark/vibetracker.git',
          },
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    expect(result.session_id).toBe('019aacfe-694c-7810-9cd3-8983125d7af8')
    expect(result.events.length).toBe(2) // session_start, session_end

    const sessionStart = result.events[0]!
    expect(sessionStart.event_type).toBe('session_start')
    expect(sessionStart.cwd).toBe('/Users/camdenclark/vibetracker')
    expect(sessionStart.git_branch).toBe('main')
  })

  test('parses user message from event_msg', async () => {
    const transcriptPath = join(tempDir, 'user-message.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: {
          id: 'sess-abc',
          cwd: '/home/user/project',
        },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message: 'hello',
          images: [],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const prompt = result.events.find((e) => e.event_type === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.prompt_text).toBe('hello')
  })

  test('extracts model from turn_context', async () => {
    const transcriptPath = join(tempDir, 'turn-context.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-abc', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'hello' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'turn_context',
        payload: {
          cwd: '/home/user/project',
          approval_policy: 'on-request',
          model: 'gpt-5.1-codex-max',
        },
      },
      {
        timestamp: '2025-11-22T19:17:50.312Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Hi there!' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const turnEnd = result.events.find((e) => e.event_type === 'turn_end')
    expect(turnEnd).toBeDefined()
    expect(turnEnd!.model).toBe('gpt-5.1-codex-max')
  })

  test('extracts token usage from token_count event', async () => {
    const transcriptPath = join(tempDir, 'token-count.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-abc', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'test' },
      },
      {
        timestamp: '2025-11-22T19:17:50.312Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 3474,
              cached_input_tokens: 3072,
              output_tokens: 14,
              reasoning_output_tokens: 0,
              total_tokens: 3488,
            },
          },
        },
      },
      {
        timestamp: '2025-11-22T19:17:50.312Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Response' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const turnEnd = result.events.find((e) => e.event_type === 'turn_end')
    expect(turnEnd).toBeDefined()
    expect(turnEnd!.prompt_tokens).toBe(6546) // 3474 + 3072
    expect(turnEnd!.completion_tokens).toBe(14)
    expect(turnEnd!.total_tokens).toBe(6560)
  })

  test('parses shell_command function call', async () => {
    const transcriptPath = join(tempDir, 'shell-command.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-abc', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'list ports' },
      },
      {
        timestamp: '2025-11-22T19:22:12.455Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: '{"command":"lsof -nP -iTCP -sTCP:LISTEN","workdir":"/Users/camdenclark/vibetracker"}',
          call_id: 'call_abc123',
        },
      },
      {
        timestamp: '2025-11-22T19:22:12.455Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call_abc123',
          output: 'Exit code: 0\nOutput: ...',
        },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Here are the ports...' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('shell_command')
    expect(toolCall!.file_path).toBe('/Users/camdenclark/vibetracker')

    const input = JSON.parse(toolCall!.tool_input!)
    expect(input.command).toBe('lsof -nP -iTCP -sTCP:LISTEN')
  })

  test('extracts bash_command and bash_command_output from shell_command', async () => {
    const transcriptPath = join(tempDir, 'bash-command.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-bash', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'check git status' },
      },
      {
        timestamp: '2025-11-22T19:22:12.455Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: '{"command":"git status","workdir":"/home/user/project"}',
          call_id: 'call_git_status',
        },
      },
      {
        timestamp: '2025-11-22T19:22:13.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call_git_status',
          output: 'On branch main\nnothing to commit, working tree clean',
        },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Your git status is clean.' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('shell_command')
    expect(toolCall!.bash_command).toBe('git status')
    expect(toolCall!.bash_command_output).toBe('On branch main\nnothing to commit, working tree clean')
  })

  test('handles interrupted turn (turn_aborted)', async () => {
    const transcriptPath = join(tempDir, 'interrupted.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-abc', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:15:47.562Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'test' },
      },
      {
        timestamp: '2025-11-22T19:17:45.946Z',
        type: 'event_msg',
        payload: { type: 'turn_aborted', reason: 'interrupted' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'hello' },
      },
      {
        timestamp: '2025-11-22T19:17:50.312Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Hi there!' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')

    expect(prompts.length).toBe(2)
    expect(prompts[0]!.prompt_text).toBe('test')
    expect(prompts[1]!.prompt_text).toBe('hello')

    // Only one completed turn (the second one)
    expect(turnEnds.length).toBe(1)
    expect(turnEnds[0]!.turn_index).toBe(1)
  })

  test('handles multiple turns correctly', async () => {
    const transcriptPath = join(tempDir, 'multi-turn.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-abc', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'hello' },
      },
      {
        timestamp: '2025-11-22T19:17:50.312Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Hi there!' },
      },
      {
        timestamp: '2025-11-22T19:18:04.157Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'list ports' },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Here are the ports...' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const prompts = result.events.filter((e) => e.event_type === 'prompt')
    const turnEnds = result.events.filter((e) => e.event_type === 'turn_end')

    expect(prompts.length).toBe(2)
    expect(turnEnds.length).toBe(2)
    expect(turnEnds[0]!.turn_index).toBe(1)
    expect(turnEnds[1]!.turn_index).toBe(2)
  })

  test('uses hookPayload session_id when available', async () => {
    const transcriptPath = join(tempDir, 'hook-payload.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-from-transcript', cwd: '/home/user/project' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const hookPayload = {
      session_id: 'sess-from-hook',
      transcript_path: transcriptPath,
      cwd: '/hook/cwd',
    }

    const result = await parseCodexTranscript(transcriptPath, hookPayload)
    expect(result.session_id).toBe('sess-from-hook')
  })

  test('parses file operations', async () => {
    const transcriptPath = join(tempDir, 'file-ops.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: { id: 'sess-abc', cwd: '/home/user/project' },
      },
      {
        timestamp: '2025-11-22T19:17:47.476Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'write a file' },
      },
      {
        timestamp: '2025-11-22T19:22:12.455Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'write_file',
          arguments: '{"path":"/home/user/project/test.ts","content":"line1\\nline2\\nline3"}',
          call_id: 'call_write',
        },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Done!' },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)
    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('write_file')
    expect(toolCall!.file_path).toBe('/home/user/project/test.ts')
    expect(toolCall!.file_action).toBe('update')
    expect(toolCall!.file_lines_added).toBe(3)
  })

  test('parses real Codex transcript format', async () => {
    // Based on actual Codex session format
    const transcriptPath = join(tempDir, 'real-format.jsonl')
    const entries = [
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'session_meta',
        payload: {
          id: '019aacfe-694c-7810-9cd3-8983125d7af8',
          timestamp: '2025-11-22T19:15:45.612Z',
          cwd: '/Users/camdenclark/vibetracker',
          originator: 'codex_cli_rs',
          cli_version: '0.63.0',
          instructions: null,
          source: 'cli',
          model_provider: 'openai',
          git: {
            commit_hash: 'ebd1e0593955c901147e22fdfe14e4c487c572f9',
            branch: 'main',
            repository_url: 'git@github.com:CamdenClark/vibetracker.git',
          },
        },
      },
      {
        timestamp: '2025-11-22T19:15:45.744Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '<environment_context>...</environment_context>',
            },
          ],
        },
      },
      {
        timestamp: '2025-11-22T19:22:07.660Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'please tell me what ports' }],
        },
      },
      {
        timestamp: '2025-11-22T19:22:07.660Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'please tell me what ports', images: [] },
      },
      {
        timestamp: '2025-11-22T19:22:07.660Z',
        type: 'turn_context',
        payload: {
          cwd: '/Users/camdenclark/vibetracker',
          approval_policy: 'on-request',
          sandbox_policy: {},
          model: 'gpt-5.1-codex',
          effort: 'medium',
          summary: 'auto',
        },
      },
      {
        timestamp: '2025-11-22T19:22:12.455Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: '{"command":"lsof -nP -iTCP -sTCP:LISTEN","workdir":"/Users/camdenclark/vibetracker"}',
          call_id: 'call_naBbq5bvg0N6ksOIxUHklaeP',
        },
      },
      {
        timestamp: '2025-11-22T19:22:12.455Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call_naBbq5bvg0N6ksOIxUHklaeP',
          output: 'Exit code: 0\nOutput: ...',
        },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 11093,
              cached_input_tokens: 9216,
              output_tokens: 286,
              reasoning_output_tokens: 64,
              total_tokens: 11379,
            },
          },
        },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'Ports with listeners...' },
      },
      {
        timestamp: '2025-11-22T19:22:30.804Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Ports with listeners...' }],
        },
      },
    ]
    await Bun.write(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n'))

    const result = await parseCodexTranscript(transcriptPath)

    expect(result.source).toBe('codex')
    expect(result.session_id).toBe('019aacfe-694c-7810-9cd3-8983125d7af8')

    const sessionStart = result.events.find((e) => e.event_type === 'session_start')
    expect(sessionStart).toBeDefined()
    expect(sessionStart!.git_branch).toBe('main')

    const prompt = result.events.find((e) => e.event_type === 'prompt')
    expect(prompt).toBeDefined()
    expect(prompt!.prompt_text).toBe('please tell me what ports')

    const toolCall = result.events.find((e) => e.event_type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.tool_name_raw).toBe('shell_command')

    const turnEnd = result.events.find((e) => e.event_type === 'turn_end')
    expect(turnEnd).toBeDefined()
    expect(turnEnd!.model).toBe('gpt-5.1-codex')
    expect(turnEnd!.prompt_tokens).toBe(20309) // 11093 + 9216
    expect(turnEnd!.completion_tokens).toBe(350) // 286 + 64
  })
})
