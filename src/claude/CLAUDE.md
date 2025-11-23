# Claude Code Provider

This directory contains all Claude Code-specific implementation for vibetracker.

## Files

- `hook.ts` - Handler for Claude Code hook events (Stop, SubagentStop)
- `transcript.ts` - Parser for Claude Code transcript files (.jsonl format)

## Integration

Claude Code invokes vibetracker via:
```bash
vibetracker claude hook [--db-path PATH]
```

Hook data is passed via stdin as JSON with fields:
- `session_id` - Unique session identifier
- `transcript_path` - Path to the transcript .jsonl file
- `event_name` - Either "Stop" or "SubagentStop"
- `permission_mode` - Current permission mode
- `stop_hook_active` - Whether stop hook is active
- `timestamp` - Event timestamp

## Transcript Format

Claude Code stores transcripts in JSONL format at:
```
~/.claude-code/transcripts/<date>/<session-id>.jsonl
```

Each line is a JSON object representing:
- User messages
- Assistant messages
- Tool use/results
- Agent trajectories (in separate agent-<id>.jsonl files)
- Session metadata

## Data Captured

- All messages (user + assistant)
- Tool calls and results
- Token usage (input, output, cache hits)
- Agent execution details
- Session metadata (project path, git branch, etc.)
