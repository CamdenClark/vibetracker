---
title: "Introduction"
weight: 1
---

# Vibetracker

Analytics for agentic coding sessions. Track tokens, tools, errors, and more.

## Overview

Vibetracker captures events from your agentic coding sessions and stores them locally in SQLite. Query your session history to understand:

- Token usage over time
- Which tools get used most
- Error rates
- File edit patterns

All data stays on your machine in `~/.vibetracker/events.db`.

## Installation

### As a Claude Code Plugin

Add the vibetracker plugins marketplace:

```bash
/plugin marketplace add camdenclark/vibetracker-plugins
```

Install the tracker plugin to automatically capture session data:

```bash
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
