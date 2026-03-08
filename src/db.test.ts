import { test, expect, describe, beforeAll, afterAll, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from 'bun:sqlite'
import type { VibeEvent } from './schema'

describe('insertEvents', () => {
  let tmpDir: string
  let sqliteDb: Database
  let dbCounter = 0

  function createTestDb(): Database {
    const dbPath = join(tmpDir, `test-events-${dbCounter++}.db`)
    const db = new Database(dbPath)
    db.exec('PRAGMA journal_mode = WAL')

    // Create events table matching the schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        team_id TEXT,
        machine_id TEXT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        session_cwd TEXT,
        session_git_repo TEXT,
        session_git_branch TEXT,
        turn_index INTEGER,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        model TEXT,
        tool_name TEXT,
        tool_name_raw TEXT,
        tool_input TEXT,
        tool_output TEXT,
        tool_success INTEGER,
        mcp_server TEXT,
        mcp_tool_name TEXT,
        file_path TEXT,
        file_action TEXT,
        file_lines_added INTEGER,
        file_lines_removed INTEGER,
        bash_command TEXT,
        bash_command_output TEXT,
        error_message TEXT,
        error_code TEXT,
        prompt_text TEXT,
        agent_id TEXT,
        agent_type TEXT,
        meta TEXT,
        synced_at TEXT
      )
    `)

    return db
  }

  function insertEventsDirectly(db: Database, events: VibeEvent[]): { inserted: number; skipped: number } {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO events (
        id, timestamp, user_id, team_id, machine_id, session_id, event_type, source,
        session_cwd, session_git_repo, session_git_branch,
        turn_index, prompt_tokens, completion_tokens, total_tokens, model,
        tool_name, tool_name_raw, tool_input, tool_output, tool_success,
        mcp_server, mcp_tool_name,
        file_path, file_action, file_lines_added, file_lines_removed,
        bash_command, bash_command_output,
        error_message, error_code,
        prompt_text,
        agent_id, agent_type,
        meta, synced_at
      ) VALUES (
        $id, $timestamp, $user_id, $team_id, $machine_id, $session_id, $event_type, $source,
        $session_cwd, $session_git_repo, $session_git_branch,
        $turn_index, $prompt_tokens, $completion_tokens, $total_tokens, $model,
        $tool_name, $tool_name_raw, $tool_input, $tool_output, $tool_success,
        $mcp_server, $mcp_tool_name,
        $file_path, $file_action, $file_lines_added, $file_lines_removed,
        $bash_command, $bash_command_output,
        $error_message, $error_code,
        $prompt_text,
        $agent_id, $agent_type,
        $meta, $synced_at
      )
    `)

    let inserted = 0

    const tx = db.transaction(() => {
      for (const event of events) {
        const result = insert.run({
          $id: event.id,
          $timestamp: event.timestamp,
          $user_id: event.user_id,
          $team_id: event.team_id ?? null,
          $machine_id: event.machine_id ?? null,
          $session_id: event.session_id,
          $event_type: event.event_type,
          $source: event.source,
          $session_cwd: event.session_cwd ?? null,
          $session_git_repo: event.session_git_repo ?? null,
          $session_git_branch: event.session_git_branch ?? null,
          $turn_index: event.turn_index ?? null,
          $prompt_tokens: event.prompt_tokens ?? null,
          $completion_tokens: event.completion_tokens ?? null,
          $total_tokens: event.total_tokens ?? null,
          $model: event.model ?? null,
          $tool_name: event.tool_name ?? null,
          $tool_name_raw: event.tool_name_raw ?? null,
          $tool_input: event.tool_input ?? null,
          $tool_output: event.tool_output ?? null,
          $tool_success: event.tool_success != null ? (event.tool_success ? 1 : 0) : null,
          $mcp_server: event.mcp_server ?? null,
          $mcp_tool_name: event.mcp_tool_name ?? null,
          $file_path: event.file_path ?? null,
          $file_action: event.file_action ?? null,
          $file_lines_added: event.file_lines_added ?? null,
          $file_lines_removed: event.file_lines_removed ?? null,
          $bash_command: event.bash_command ?? null,
          $bash_command_output: event.bash_command_output ?? null,
          $error_message: event.error_message ?? null,
          $error_code: event.error_code ?? null,
          $prompt_text: event.prompt_text ?? null,
          $agent_id: event.agent_id ?? null,
          $agent_type: event.agent_type ?? null,
          $meta: event.meta ? JSON.stringify(event.meta) : null,
          $synced_at: event.synced_at ?? null,
        })
        if (result.changes > 0) inserted++
      }
    })

    tx()

    return { inserted, skipped: events.length - inserted }
  }

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibetracker-db-test-'))
  })

  afterAll(() => {
    if (sqliteDb) sqliteDb.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeEvent(overrides: Partial<VibeEvent> = {}): VibeEvent {
    return {
      id: `test-${Math.random().toString(36).slice(2)}`,
      timestamp: '2024-01-01T00:00:00Z',
      user_id: 'test-user',
      session_id: 'test-session',
      event_type: 'session_start',
      source: 'claude_code',
      ...overrides,
    }
  }

  test('inserts events into database', () => {
    sqliteDb = createTestDb()
    const events = [makeEvent({ id: 'evt-1' }), makeEvent({ id: 'evt-2' })]

    const result = insertEventsDirectly(sqliteDb, events)

    expect(result.inserted).toBe(2)
    expect(result.skipped).toBe(0)

    const rows = sqliteDb.query('SELECT * FROM events').all() as any[]
    expect(rows).toHaveLength(2)
  })

  test('skips duplicate events by id', () => {
    sqliteDb = createTestDb()
    const events = [makeEvent({ id: 'dup-1' })]
    insertEventsDirectly(sqliteDb, events)

    // Try inserting same id again
    const result = insertEventsDirectly(sqliteDb, [makeEvent({ id: 'dup-1' })])

    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(1)

    const rows = sqliteDb.query('SELECT * FROM events').all() as any[]
    expect(rows).toHaveLength(1)
  })

  test('handles empty event list', () => {
    sqliteDb = createTestDb()
    const result = insertEventsDirectly(sqliteDb, [])

    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(0)
  })

  test('stores optional fields as null when missing', () => {
    sqliteDb = createTestDb()
    const event = makeEvent({ id: 'null-test' })
    insertEventsDirectly(sqliteDb, [event])

    const row = sqliteDb.query('SELECT * FROM events WHERE id = ?').get('null-test') as any
    expect(row.team_id).toBeNull()
    expect(row.machine_id).toBeNull()
    expect(row.tool_name).toBeNull()
    expect(row.model).toBeNull()
    expect(row.prompt_text).toBeNull()
    expect(row.agent_id).toBeNull()
  })

  test('stores all event fields correctly', () => {
    sqliteDb = createTestDb()
    const event = makeEvent({
      id: 'full-test',
      timestamp: '2024-06-15T10:30:00Z',
      user_id: 'alice',
      team_id: 'team-a',
      machine_id: 'laptop-1',
      session_id: 'sess-123',
      event_type: 'tool_call',
      source: 'claude_code',
      session_cwd: '/home/alice/project',
      session_git_repo: 'alice/project',
      session_git_branch: 'feature-branch',
      turn_index: 3,
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
      model: 'claude-sonnet-4-20250514',
      tool_name: 'bash',
      tool_name_raw: 'Bash',
      tool_input: 'ls -la',
      tool_output: 'file1.ts file2.ts',
      tool_success: true,
      file_path: '/home/alice/project/index.ts',
      file_action: 'update',
      file_lines_added: 5,
      file_lines_removed: 2,
      bash_command: 'ls -la',
      bash_command_output: 'file1.ts file2.ts',
      prompt_text: 'List files',
      agent_id: 'agent-456',
      agent_type: 'Explore',
      meta: { key: 'value' },
    })

    insertEventsDirectly(sqliteDb, [event])

    const row = sqliteDb.query('SELECT * FROM events WHERE id = ?').get('full-test') as any
    expect(row.timestamp).toBe('2024-06-15T10:30:00Z')
    expect(row.user_id).toBe('alice')
    expect(row.team_id).toBe('team-a')
    expect(row.machine_id).toBe('laptop-1')
    expect(row.session_id).toBe('sess-123')
    expect(row.event_type).toBe('tool_call')
    expect(row.source).toBe('claude_code')
    expect(row.session_cwd).toBe('/home/alice/project')
    expect(row.session_git_repo).toBe('alice/project')
    expect(row.session_git_branch).toBe('feature-branch')
    expect(row.turn_index).toBe(3)
    expect(row.prompt_tokens).toBe(100)
    expect(row.completion_tokens).toBe(200)
    expect(row.total_tokens).toBe(300)
    expect(row.model).toBe('claude-sonnet-4-20250514')
    expect(row.tool_name).toBe('bash')
    expect(row.tool_name_raw).toBe('Bash')
    expect(row.tool_success).toBe(1)
    expect(row.file_path).toBe('/home/alice/project/index.ts')
    expect(row.file_action).toBe('update')
    expect(row.file_lines_added).toBe(5)
    expect(row.file_lines_removed).toBe(2)
    expect(row.agent_id).toBe('agent-456')
    expect(row.agent_type).toBe('Explore')
    expect(JSON.parse(row.meta)).toEqual({ key: 'value' })
  })

  test('tool_success false is stored as 0', () => {
    sqliteDb = createTestDb()
    const event = makeEvent({
      id: 'bool-test',
      tool_success: false,
    })
    insertEventsDirectly(sqliteDb, [event])

    const row = sqliteDb.query('SELECT * FROM events WHERE id = ?').get('bool-test') as any
    expect(row.tool_success).toBe(0)
  })

  test('inserts mixed new and duplicate events', () => {
    sqliteDb = createTestDb()
    insertEventsDirectly(sqliteDb, [makeEvent({ id: 'existing-1' })])

    const result = insertEventsDirectly(sqliteDb, [
      makeEvent({ id: 'existing-1' }),  // duplicate
      makeEvent({ id: 'new-1' }),       // new
      makeEvent({ id: 'new-2' }),       // new
    ])

    expect(result.inserted).toBe(2)
    expect(result.skipped).toBe(1)

    const rows = sqliteDb.query('SELECT * FROM events').all() as any[]
    expect(rows).toHaveLength(3)
  })
})
