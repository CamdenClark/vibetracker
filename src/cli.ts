#!/usr/bin/env bun

import { parseArgs } from 'util'
import { loadConfig } from './config'
import { insertEvents } from './db'
import {
  parseClaudeTranscript,
  parseClaudeSubagentTranscript,
  parseClaudeHookPayload,
  isSubagentStopPayload
} from './ingest/claude'
import {
  parseCodexTranscript,
  parseCodexHookPayload,
  findCodexTranscript
} from './ingest/codex'
import {
  parseGeminiTranscript,
  parseGeminiHookPayload,
  findGeminiTranscript
} from './ingest/gemini'
import { mapToVibeEvents } from './ingest/mapper'

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
  -s, --source <source>     Agent source (claude, codex, gemini, opencode, cursor)
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

      // Parse transcript into intermediate format
      let parsed
      if (hookPayload && isSubagentStopPayload(hookPayload)) {
        // Handle SubagentStop hook - parse subagent transcript
        parsed = await parseClaudeSubagentTranscript(hookPayload)
      } else {
        // Handle Stop hook or manual ingestion
        parsed = await parseClaudeTranscript(transcriptPath, hookPayload)
      }

      // Map to VibeEvents
      const events = await mapToVibeEvents(parsed, config)

      // Store events
      const { inserted, skipped } = insertEvents(events)
      console.log(`Ingested ${inserted} events (${skipped} duplicates skipped)`)
    } else if (values.source === 'codex') {
      let transcriptPath = values.transcript
      let hookPayload

      // If no transcript path, try reading hook payload from stdin
      if (!transcriptPath) {
        const stdin = await Bun.stdin.text()
        if (stdin.trim()) {
          hookPayload = await parseCodexHookPayload(stdin)
          transcriptPath = hookPayload.transcript_path
        }
      }

      // If still no transcript, try to find the most recent one
      if (!transcriptPath) {
        transcriptPath = await findCodexTranscript() ?? undefined
      }

      if (!transcriptPath) {
        console.error('Error: No transcript path. Provide --transcript or pipe hook payload to stdin')
        process.exit(1)
      }

      // Parse transcript into intermediate format
      const parsed = await parseCodexTranscript(transcriptPath, hookPayload)

      // Map to VibeEvents
      const events = await mapToVibeEvents(parsed, config)

      // Store events
      const { inserted, skipped } = insertEvents(events)
      console.log(`Ingested ${inserted} events (${skipped} duplicates skipped)`)
    } else if (values.source === 'gemini') {
      let transcriptPath = values.transcript
      let hookPayload

      // If no transcript path, try reading hook payload from stdin
      if (!transcriptPath) {
        const stdin = await Bun.stdin.text()
        if (stdin.trim()) {
          hookPayload = await parseGeminiHookPayload(stdin)
          transcriptPath = hookPayload.transcript_path
        }
      }

      // If still no transcript, try to find the most recent one
      if (!transcriptPath) {
        transcriptPath = await findGeminiTranscript() ?? undefined
      }

      if (!transcriptPath) {
        console.error('Error: No transcript path. Provide --transcript or pipe hook payload to stdin')
        process.exit(1)
      }

      // Parse transcript into intermediate format
      const parsed = await parseGeminiTranscript(transcriptPath, hookPayload)

      // Map to VibeEvents
      const events = await mapToVibeEvents(parsed, config)

      // Store events
      const { inserted, skipped } = insertEvents(events)
      console.log(`Ingested ${inserted} events (${skipped} duplicates skipped)`)
    } else {
      console.error(`Error: Source "${values.source}" not yet implemented`)
      process.exit(1)
    }
  } else if (command === 'status') {
    const { getDb } = await import('./db')
    const { events } = await import('./db/schema')
    const { count, countDistinct, isNull } = await import('drizzle-orm')
    const db = getDb()

    const totalResult = db.select({ count: count() }).from(events).get()
    const unsyncedResult = db.select({ count: count() }).from(events).where(isNull(events.synced_at)).get()
    const sessionsResult = db.select({ count: countDistinct(events.session_id) }).from(events).get()

    console.log(`Total events: ${totalResult?.count ?? 0}`)
    console.log(`Unsynced events: ${unsyncedResult?.count ?? 0}`)
    console.log(`Total sessions: ${sessionsResult?.count ?? 0}`)
  } else if (command === 'query') {
    const sqlQuery = positionals[1]
    if (!sqlQuery) {
      console.error('Error: SQL query required')
      process.exit(1)
    }

    const { getSqliteDb } = await import('./db')
    const db = getSqliteDb()

    const results = db.query(sqlQuery).all()
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
