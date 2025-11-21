# Vibetracker

Vibetracker is a local tracking system for AI coding assistants like Claude Code, Cursor, Gemini CLI, and others. It hooks into these tools to track conversations, tool calls, and interactions locally in a SQLite database.

## Project Goals

- Track AI assistant conversations and interactions locally
- Store tool calls, prompts, and responses in SQLite
- Provide insights into AI coding assistant usage patterns
- Support multiple AI coding assistants (Claude Code, Cursor, Gemini CLI, etc.)
- Privacy-first: all data stays local

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite (using `bun:sqlite`)
- **API**: Bun.serve() with WebSocket support
- **Frontend**: HTML imports with React
- **Testing**: bun:test

## Setup

```bash
# Install dependencies
bun install

# Run the server
bun --hot ./index.ts

# Run tests
bun test
```

## Architecture

### Database Schema

The SQLite database will track:
- **Sessions**: Individual coding sessions with an AI assistant
- **Conversations**: Individual conversations within sessions
- **Messages**: User and assistant messages
- **Tool Calls**: Tools invoked by the assistant (file reads, edits, bash commands, etc.)
- **Metadata**: Assistant type, model, timestamps, etc.

### Hook Integration

Vibetracker will integrate with AI assistants through:
- Environment variable hooks
- Configuration file hooks
- API interception (where supported)
- Log file parsing (fallback method)

## Development

Use Bun for all operations:
- `bun <file>` - Run TypeScript/JavaScript files
- `bun test` - Run tests
- `bun install` - Install dependencies
- `bun --hot ./index.ts` - Run with hot reload

## Privacy

All data is stored locally in SQLite. No data is sent to external servers unless explicitly configured by the user.
