# Vibetracker

Vibetracker is a CLI tool that hooks into Claude Code to capture and store conversation transcripts in a local SQLite database.

## Project Goals

- Listen for Claude Code hook events (Stop, SubagentStop)
- Capture conversation transcripts automatically
- Store transcripts in a local SQLite database
- Privacy-first: all data stays local

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite (using `bun:sqlite`)
- **Testing**: bun:test

## Setup

```bash
# Install dependencies
bun install

# Run tests
bun test
```

## Architecture

### Database Schema

The SQLite database will track:
- **Transcripts**: Complete conversation transcripts
- **Events**: Hook event data (Stop, SubagentStop)
- **Metadata**: Timestamps, session info, etc.

### Hook Integration

Vibetracker integrates with Claude Code through hooks:
- Listens for `Stop` events (main conversation ends)
- Listens for `SubagentStop` events (subagent/task completion)
- Captures transcript data from hook payloads
- Stores in SQLite for later analysis

## Development

Use Bun for all operations:
- `bun <file>` - Run TypeScript/JavaScript files
- `bun test` - Run tests
- `bun install` - Install dependencies
- `bun --hot ./index.ts` - Run with hot reload

## Privacy

All data is stored locally in SQLite. No data is sent to external servers unless explicitly configured by the user.
