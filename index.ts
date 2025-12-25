#!/usr/bin/env bun

import { handleClaudeHook } from "./src/claude/hook.ts";
import { handleCodexNotify } from "./src/codex/notify.ts";

const command = process.argv[2];
const subcommand = process.argv[3];

// Parse optional --db-path flag
let dbPath: string | undefined;
const dbPathIndex = process.argv.indexOf("--db-path");
if (dbPathIndex !== -1 && process.argv[dbPathIndex + 1]) {
  dbPath = process.argv[dbPathIndex + 1];
}

if (command === "claude" && subcommand === "hook") {
  await handleClaudeHook(dbPath);
} else if (command === "codex" && subcommand === "notify") {
  await handleCodexNotify(dbPath);
} else {
  console.error("Usage:");
  console.error("  vibetracker claude hook [--db-path PATH]    - Handle Claude Code hook events");
  console.error("  vibetracker codex notify [--db-path PATH]   - Handle Codex notify events");
  console.error("");
  console.error("Options:");
  console.error("  --db-path PATH    Use custom database path (default: ~/.vibetracker/transcripts.db)");
  process.exit(1);
}
