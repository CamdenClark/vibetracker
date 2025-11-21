#!/usr/bin/env bun

const command = process.argv[2];
const subcommand = process.argv[3];

if (command === "claude" && subcommand === "hook") {
  const { handleClaudeHook } = await import("./src/claude-hook.ts");
  await handleClaudeHook();
} else if (command === "migrate") {
  const { default: migrate } = await import("./src/migrate.ts");
  // Migration runs automatically on import
} else {
  console.error("Usage:");
  console.error("  vibetracker claude hook    - Handle Claude Code hook events");
  console.error("  vibetracker migrate        - Migrate old transcripts to new schema");
  process.exit(1);
}
