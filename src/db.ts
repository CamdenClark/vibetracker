import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import type { VibeEvent } from './schema'
import { getDbPath } from './config'

let db: Database | null = null

export function getDb(): Database {
  if (db) return db

  const dbPath = getDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })

  db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  initSchema(db)

  return db
}

function initSchema(db: Database): void {
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
      session_duration_ms INTEGER,

      turn_index INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      model TEXT,

      tool_name TEXT,
      tool_name_raw TEXT,
      tool_input TEXT,
      tool_output TEXT,
      tool_duration_ms INTEGER,
      tool_success INTEGER,

      mcp_server TEXT,
      mcp_tool_name TEXT,

      file_path TEXT,
      file_action TEXT,
      file_lines_added INTEGER,
      file_lines_removed INTEGER,

      error_message TEXT,
      error_code TEXT,

      prompt_text TEXT,

      agent_id TEXT,
      agent_type TEXT,

      meta TEXT,
      synced_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup
    ON events(session_id, timestamp, event_type, COALESCE(tool_name_raw, ''), COALESCE(tool_input, ''));

    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_synced ON events(synced_at);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
  `)
}

export function insertEvents(events: VibeEvent[]): { inserted: number; skipped: number } {
  const db = getDb()

  const insert = db.prepare(`
    INSERT OR IGNORE INTO events (
      id, timestamp, user_id, team_id, machine_id, session_id, event_type, source,
      session_cwd, session_git_repo, session_git_branch, session_duration_ms,
      turn_index, prompt_tokens, completion_tokens, total_tokens, model,
      tool_name, tool_name_raw, tool_input, tool_output, tool_duration_ms, tool_success,
      mcp_server, mcp_tool_name,
      file_path, file_action, file_lines_added, file_lines_removed,
      error_message, error_code,
      prompt_text,
      agent_id, agent_type,
      meta, synced_at
    ) VALUES (
      $id, $timestamp, $user_id, $team_id, $machine_id, $session_id, $event_type, $source,
      $session_cwd, $session_git_repo, $session_git_branch, $session_duration_ms,
      $turn_index, $prompt_tokens, $completion_tokens, $total_tokens, $model,
      $tool_name, $tool_name_raw, $tool_input, $tool_output, $tool_duration_ms, $tool_success,
      $mcp_server, $mcp_tool_name,
      $file_path, $file_action, $file_lines_added, $file_lines_removed,
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
        $session_duration_ms: event.session_duration_ms ?? null,
        $turn_index: event.turn_index ?? null,
        $prompt_tokens: event.prompt_tokens ?? null,
        $completion_tokens: event.completion_tokens ?? null,
        $total_tokens: event.total_tokens ?? null,
        $model: event.model ?? null,
        $tool_name: event.tool_name ?? null,
        $tool_name_raw: event.tool_name_raw ?? null,
        $tool_input: event.tool_input ?? null,
        $tool_output: event.tool_output ?? null,
        $tool_duration_ms: event.tool_duration_ms ?? null,
        $tool_success: event.tool_success != null ? (event.tool_success ? 1 : 0) : null,
        $mcp_server: event.mcp_server ?? null,
        $mcp_tool_name: event.mcp_tool_name ?? null,
        $file_path: event.file_path ?? null,
        $file_action: event.file_action ?? null,
        $file_lines_added: event.file_lines_added ?? null,
        $file_lines_removed: event.file_lines_removed ?? null,
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
