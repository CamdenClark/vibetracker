---
title: "Installation"
weight: 2
---

# Installation

Vibetracker supports multiple agentic coding tools. Choose your preferred tool below to get started.

## Supported Tools

- **[Claude Code]({{< relref "claude" >}})** - Anthropic's CLI for Claude
- **[Codex]({{< relref "codex" >}})** - OpenAI's coding agent
- **[Gemini CLI]({{< relref "gemini" >}})** - Google's Gemini CLI

## Prerequisites

All installations require [Bun](https://bun.sh) to be installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

## How It Works

Vibetracker captures events from your agentic coding sessions using hooks. When a session ends, the transcript is parsed and stored locally in SQLite at `~/.vibetracker/events.db`.

Each tool has slightly different hook mechanisms, but the data captured is consistent:
- Session start/end times
- Token usage per turn
- Tool calls and their arguments
- File operations
- Git context (branch, repo)
