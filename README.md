# Vibetracker

A CLI tool that hooks into Claude Code to capture conversation transcripts in a local SQLite database.

## What is Vibetracker?

Vibetracker listens to Claude Code hook events (Stop, SubagentStop) and automatically stores conversation transcripts in SQLite. All data stays on your machine - privacy first.

## Quick Start

```bash
# Install dependencies
bun install

# Run tests
bun test
```

## Features (Planned)

- 📊 Capture Claude Code conversation transcripts
- 🗄️ Store transcripts locally in SQLite
- 🪝 Hook into Stop and SubagentStop events
- 🔒 Privacy-first: all data stays local

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite (bun:sqlite)

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed project documentation and architecture.

## License

MIT
