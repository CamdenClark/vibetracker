import { Database } from 'bun:sqlite'
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { sql } from 'drizzle-orm'
import type { VibeEvent } from './schema'
import { getDbPath, getConfigDir } from './config'
import * as schema from './db/schema'

let db: BunSQLiteDatabase<typeof schema> | null = null
let sqliteDb: Database | null = null

export function getDb(): BunSQLiteDatabase<typeof schema> {
  if (db) return db

  const dbPath = getDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })

  sqliteDb = new Database(dbPath)
  sqliteDb.exec('PRAGMA journal_mode = WAL')

  db = drizzle(sqliteDb, { schema })

  // Run migrations automatically
  const migrationsFolder = join(import.meta.dir, 'db', 'migrations')
  try {
    migrate(db, { migrationsFolder })
  } catch (e) {
    // Migrations folder may not exist on first run before any migrations are generated
    if (!(e instanceof Error && e.message.includes('ENOENT'))) {
      throw e
    }
  }

  return db
}

export function getSqliteDb(): Database {
  if (!sqliteDb) {
    getDb() // Initialize if not already done
  }
  return sqliteDb!
}

export function insertEvents(events: VibeEvent[]): { inserted: number; skipped: number } {
  const db = getDb()
  const sqliteDb = getSqliteDb()

  const insert = sqliteDb.prepare(`
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

  const tx = sqliteDb.transaction(() => {
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
