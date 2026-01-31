---
title: "Claude Code"
weight: 1
---

# Claude Code Installation

Install Vibetracker to track your [Claude Code](https://claude.ai/code) sessions.

## Option 1: Plugin Installation (Recommended)

The easiest way to install Vibetracker is through the Claude Code plugin system.

### Add the Plugin Marketplace

```bash
/plugin marketplace add camdenclark/vibetracker-plugins
```

### Install the Tracker Plugin

```bash
/plugin install tracker
```

That's it! The plugin will automatically capture session data.

## Option 2: Manual Installation

If you prefer manual setup, you can configure hooks directly.

### Install the Package

```bash
bun add -g vibetracker
```

### Configure Hooks

Add the following to your `~/.claude/settings.json`:

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

The hooks capture both main session and subagent session completions.

## Verify Installation

After running a session, check that events were captured:

```bash
bunx vibetracker status
```

You should see output showing total events and sessions tracked.
