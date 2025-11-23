# Codex CLI Provider

This directory contains all Codex CLI-specific implementation for vibetracker.

## Files

- `notify.ts` - Handler for Codex notify events
- `transcript.ts` - Parser for Codex transcript files (.jsonl format)

## Integration

Codex CLI invokes vibetracker via:
```bash
vibetracker codex notify [--db-path PATH] '<json-notification>'
```

Notification data is passed as a JSON string argument with fields:
- `type` - Event type (e.g., "agent-turn-complete")
- `thread-id` - Unique thread/session identifier
- `turn-id` - Turn identifier
- `cwd` - Current working directory
- `input-messages` - Array of input message references
- `last-assistant-message` - Last assistant message reference

## Transcript Format

Codex stores transcripts in JSONL format at:
```
~/.codex/sessions/YYYY/MM/DD/<session-name>-<thread-id>.jsonl
```

Each line is a JSON object representing events:
- `session_meta` - Session metadata (cwd, git info, model provider)
- `turn_context` - Turn context information
- `response_item` - Messages (user, assistant, reasoning)
- `event_msg` - Various event messages (user_message, agent_message, token_count)

## Data Captured

- All messages (user, assistant, reasoning)
- Function calls and outputs
- Token usage (including reasoning tokens)
- Session metadata (git commit, repository, CLI version)
- Model provider information

## Notes

- Codex doesn't provide UUIDs for messages, so we generate them
- Reasoning content may be encrypted in some cases
- Searches for transcript files across the last 7 days to handle multi-day sessions
