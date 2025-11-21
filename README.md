# Vibetracker

A CLI tool that hooks into Claude Code to capture conversation transcripts in a local SQLite database.

## What is Vibetracker?

Vibetracker listens to Claude Code hook events (Stop, SubagentStop) and automatically stores conversation transcripts in SQLite. All data stays on your machine - privacy first.

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

## Setup with Claude Code

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

Now vibetracker will automatically capture all your Claude Code conversations!

## Usage

Once configured, vibetracker runs automatically. Transcripts are stored in `~/.vibetracker/transcripts.db`.

## Features

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
