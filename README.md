# Vibetracker

A local tracking system for AI coding assistants like Claude Code, Cursor, Gemini CLI, and others.

## What is Vibetracker?

Vibetracker hooks into AI coding assistants to track conversations, tool calls, and interactions locally in a SQLite database. All data stays on your machine - privacy first.

## Quick Start

```bash
# Install dependencies
bun install

# Run the server
bun run dev

# Run tests
bun test
```

## Features (Planned)

- 📊 Track AI assistant conversations and tool usage
- 🗄️ Store data locally in SQLite
- 🔌 Support for multiple AI assistants (Claude Code, Cursor, Gemini CLI)
- 📈 Usage insights and analytics
- 🔒 Privacy-first: all data stays local

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite (bun:sqlite)
- **API**: Bun.serve() with WebSocket support
- **Frontend**: React with HTML imports

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed project documentation and architecture.

## License

MIT
