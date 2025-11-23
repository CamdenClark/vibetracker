#!/usr/bin/env bun

const command = process.argv[2];
const subcommand = process.argv[3];

if (command === "claude" && subcommand === "hook") {
  const { handleClaudeHook } = await import("./src/claude-hook.ts");
  await handleClaudeHook();
} else if (command === "codex" && subcommand === "notify") {
  const { handleCodexNotify } = await import("./src/codex-notify.ts");
  await handleCodexNotify();
} else {
  console.error("Usage:");
  console.error("  vibetracker claude hook    - Handle Claude Code hook events");
  console.error("  vibetracker codex notify   - Handle Codex notify events");
  process.exit(1);
}
