#!/usr/bin/env bun

const command = process.argv[2];
const subcommand = process.argv[3];

if (command === "claude" && subcommand === "hook") {
  const { claudeHook } = await import("./src/claude-hook.ts");
  await claudeHook();
} else {
  console.error("Usage: vibetracker claude hook");
  process.exit(1);
}
