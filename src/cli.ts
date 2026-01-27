#!/usr/bin/env bun

import { parseArgs } from 'util'
import { loadConfig } from './config'
import { insertEvents } from './db'
import {
  ingestClaudeTranscript,
  ingestClaudeSubagentTranscript,
  parseClaudeHookPayload,
  isSubagentStopPayload
} from './ingest/claude'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: 'string', short: 's' },
    transcript: { type: 'string', short: 't' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
})

const command = positionals[0]

if (values.help || !command) {
  console.log(`
vibe-tracker - Track agentic coding sessions

Usage:
  vibe-tracker ingest --source <source> [--transcript <path>]
  vibe-tracker status
  vibe-tracker query <sql>

Commands:
  ingest    Ingest events from an agent transcript
  status    Show database status
  query     Run SQL query against local database

Options:
  -s, --source <source>     Agent source (claude, codex, opencode, cursor)
  -t, --transcript <path>   Path to transcript file (optional for claude)
  -h, --help                Show this help
`)
  process.exit(0)
}

async function main() {
  const config = await loadConfig()

  if (command === 'ingest') {
    if (!values.source) {
      console.error('Error: --source is required')
      process.exit(1)
    }

    if (values.source === 'claude') {
      let transcriptPath = values.transcript
      let hookPayload

      // If no transcript path, try reading hook payload from stdin
      if (!transcriptPath) {
        const stdin = await Bun.stdin.text()
        if (stdin.trim()) {
          hookPayload = await parseClaudeHookPayload(stdin)
          transcriptPath = hookPayload.transcript_path
        }
      }

      if (!transcriptPath) {
        console.error('Error: No transcript path. Provide --transcript or pipe hook payload to stdin')
        process.exit(1)
      }

      let events
      if (hookPayload && isSubagentStopPayload(hookPayload)) {
        // Handle SubagentStop hook - ingest subagent transcript
        events = await ingestClaudeSubagentTranscript(hookPayload, config)
      } else {
        // Handle Stop hook or manual ingestion
        events = await ingestClaudeTranscript(transcriptPath, config, hookPayload)
      }

      const { inserted, skipped } = insertEvents(events)
      console.log(`Ingested ${inserted} events (${skipped} duplicates skipped)`)
    } else {
      console.error(`Error: Source "${values.source}" not yet implemented`)
      process.exit(1)
    }
  } else if (command === 'status') {
    const { getDb } = await import('./db')
    const db = getDb()

    const total = db.query('SELECT COUNT(*) as count FROM events').get() as { count: number }
    const unsynced = db.query('SELECT COUNT(*) as count FROM events WHERE synced_at IS NULL').get() as { count: number }
    const sessions = db.query('SELECT COUNT(DISTINCT session_id) as count FROM events').get() as { count: number }

    console.log(`Total events: ${total.count}`)
    console.log(`Unsynced events: ${unsynced.count}`)
    console.log(`Total sessions: ${sessions.count}`)
  } else if (command === 'query') {
    const sql = positionals[1]
    if (!sql) {
      console.error('Error: SQL query required')
      process.exit(1)
    }

    const { getDb } = await import('./db')
    const db = getDb()

    const results = db.query(sql).all()
    console.log(JSON.stringify(results, null, 2))
  } else {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
