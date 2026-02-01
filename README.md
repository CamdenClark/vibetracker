# vibetracker

Analytics for agentic coding sessions. Track tokens, tools, errors, and more across your team.

## Installation

### As a Claude Code Plugin

Add the vibetracker plugins marketplace:
```
/plugin marketplace add camdenclark/vibetracker
```

Install the tracker plugin to automatically capture session data:
```
/plugin install tracker
```

### Manual Installation

1. Install the package globally:
```bash
bun add -g vibetracker
```

2. Add hooks to your `~/.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bunx vibetracker ingest --source claude"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bunx vibetracker ingest --source claude"
          }
        ]
      }
    ]
  }
}
```

## Usage

### Check status

```bash
bunx vibetracker status
```

### Query events

```bash
bunx vibetracker query "SELECT event_type, COUNT(*) FROM events GROUP BY event_type"
```

### Example queries

```sql
-- Token usage by day
SELECT date(timestamp) as day, SUM(input_tokens) as input, SUM(output_tokens) as output
FROM events WHERE event_type = 'turn_end' GROUP BY day ORDER BY day DESC

-- Most used tools
SELECT tool_name, COUNT(*) as count FROM events
WHERE event_type = 'tool_call' GROUP BY tool_name ORDER BY count DESC

-- Error rate
SELECT source,
  COUNT(CASE WHEN event_type = 'error' THEN 1 END) * 100.0 / COUNT(*) as error_rate
FROM events GROUP BY source
```

## Data Storage

Events are stored locally in `~/.vibetracker/events.db` (SQLite).

## Plugins

This repository includes plugins for agentic coding tools in the `plugins/` directory:

### Claude Code Plugins (`plugins/claude/`)

- **tracker** - Automatically captures session events to your local vibetracker database
- **analysis** - Analysis tools for vibetracker data, including `/permissions` to generate `.claude/config.json`

## Development

```bash
bun install
bun test
bun run src/cli.ts status
```
