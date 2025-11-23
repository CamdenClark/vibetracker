# Vibetracker

A CLI tool that captures AI coding assistant conversations in a local SQLite database.

## Supported AI Assistants

- **Claude Code** - Anthropic's Claude Code assistant
- **Codex CLI** - OpenAI's Codex CLI tool
- More coming soon: Cursor, Gemini, etc.

## What is Vibetracker?

Vibetracker automatically captures and stores conversation transcripts from AI coding assistants. All data stays on your machine - privacy first.

## Installation

```bash
# Clone the repository
git clone https://github.com/CamdenClark/vibetracker.git
cd vibetracker

# Install dependencies
bun install

# Link the CLI globally
bun link
```

## Setup

### Claude Code

Add vibetracker to your Claude Code hooks configuration (`~/.claude/config.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "vibetracker claude hook"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "vibetracker claude hook"
          }
        ]
      }
    ]
  }
}
```

### Codex CLI

Support for Codex CLI is built-in. You can manually import Codex session files:

```bash
vibetracker import ~/.codex/sessions/2025/11/22/*.jsonl
```

## Usage

Transcripts are stored in `~/.vibetracker/transcripts.db`.

### Query Examples

```bash
# View all sessions
sqlite3 ~/.vibetracker/transcripts.db "SELECT session_id, provider, started_at FROM sessions ORDER BY started_at DESC LIMIT 10;"

# Get tool usage stats by provider
sqlite3 ~/.vibetracker/transcripts.db "SELECT provider, tool_name, COUNT(*) as count FROM tool_calls GROUP BY provider, tool_name ORDER BY count DESC;"

# Find sessions by project
sqlite3 ~/.vibetracker/transcripts.db "SELECT * FROM sessions WHERE project_path LIKE '%vibetracker%';"
```

## Features

- 📊 Multi-provider support (Claude Code, Codex CLI)
- 🗄️ Unified SQLite storage with provider tracking
- 🔄 Auto-detects which AI assistant format
- 🪝 Hook integration for Claude Code
- 🔒 Privacy-first: all data stays local
- 🔍 Cross-provider analytics and queries

## Architecture

Vibetracker uses an adapter pattern to support multiple AI assistants:

- **Adapters**: Each AI assistant has an adapter that converts its format to a unified schema
- **Auto-detection**: Automatically identifies which provider format
- **Universal schema**: All providers stored in the same database tables
- **Provider metadata**: Provider-specific data preserved in JSON fields

See [SCHEMA_DESIGN.md](./SCHEMA_DESIGN.md) for detailed schema documentation.

## Adding New Providers

Create a new adapter in `src/adapters/your-provider.ts`:

```typescript
export class YourProviderAdapter implements ProviderAdapter {
  readonly provider = 'your_provider';
  readonly modelProvider = 'llm_provider';

  canParse(content: string): boolean {
    // Detect your provider's format
  }

  parse(content: string, filePath?: string): ParsedTranscript {
    // Parse into unified schema
  }
}
```

Register it in `src/parser.ts` and you're done!

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite (bun:sqlite)
- **Testing**: bun:test

## License

MIT
