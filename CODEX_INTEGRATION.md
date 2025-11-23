# Codex Integration Guide

This document describes how vibetracker integrates with Codex CLI.

## How It Works

Codex supports a `--notify` flag that calls an external program when agent turns complete. Vibetracker uses this to automatically capture Codex sessions.

### Notification Format

Codex sends notifications as JSON with this structure:

```json
{
  "type": "agent-turn-complete",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "turn-id": "12345",
  "cwd": "/Users/alice/projects/example",
  "input-messages": ["Rename `foo` to `bar` and update the callsites."],
  "last-assistant-message": "Rename complete and verified `cargo build` succeeds."
}
```

### Handler Implementation

The `vibetracker codex notify` command:

1. Receives the JSON notification as a command-line argument
2. Extracts the `thread-id` from the notification
3. Searches for the transcript in `~/.codex/sessions/YYYY/MM/DD/*-<thread-id>.jsonl`
   - Searches today and the last 7 days (handles sessions that started on a different day)
4. Parses the transcript using the CodexAdapter
5. Stores the session, messages, and tool calls in the SQLite database

## Setup

### Option 1: Per-command

```bash
codex --notify "vibetracker codex notify" "Your task here"
```

### Option 2: Global config

Add to `~/.codex/config.toml`:

```toml
notify = "vibetracker codex notify"
```

### Option 3: Project-specific

Add to your project's `.codex/config.toml`:

```toml
notify = "vibetracker codex notify"
```

## File Locations

- **Codex transcripts**: `~/.codex/sessions/YYYY/MM/DD/<session-name>.jsonl`
  - Example: `~/.codex/sessions/2025/11/22/rollout-2025-11-22T11-15-45-019aacfe-694c-7810-9cd3-8983125d7af8.jsonl`
  - The filename includes the thread-id at the end
  - Vibetracker searches for files matching `*-<thread-id>.jsonl` across the last 7 days
  - This handles sessions that started on a previous day
- **Vibetracker database**: `~/.vibetracker/transcripts.db`

## Implementation Files

- `index.ts` - CLI entrypoint, routes to `codex notify` handler
- `src/codex-notify.ts` - Notification handler
- `src/adapters/codex.ts` - Codex transcript parser
- `src/parser.ts` - Auto-detects and uses CodexAdapter

## Testing

Test the integration:

```bash
# This should show an error about missing notification data
bun run index.ts codex notify

# This should show an error about missing transcript file
bun run index.ts codex notify '{"type":"agent-turn-complete","thread-id":"test","turn-id":"1","cwd":"/tmp","input-messages":["test"],"last-assistant-message":"done"}'
```

## What Gets Captured

From each Codex session:

- **Session metadata**: thread ID, working directory, git branch, timestamps
- **Messages**: All user and assistant messages
- **Tool calls**: Function calls with inputs and outputs
- **Reasoning**: Extended thinking (when available)
- **Token usage**: Input, output, cached, and reasoning tokens
- **Provider info**: Codex CLI version, originator, model provider

All data is stored in the unified vibetracker schema alongside Claude Code sessions.
