---
title: "Vibetracker Documentation"
type: docs
---

# Vibetracker

Analytics for agentic coding sessions. Track tokens, tools, errors, and more.

## Overview

Vibetracker captures events from your agentic coding sessions and stores them locally in SQLite. Query your session history to understand:

- **Token usage** - Track input/output tokens over time
- **Tool calls** - See which tools get used most
- **Error rates** - Monitor failures and issues
- **File patterns** - Understand edit patterns across your codebase

All data stays on your machine in `~/.vibetracker/events.db`.

## Quick Start with Claude Code

The fastest way to get started is with [Claude Code](https://claude.ai/code). Install via the plugin system:

```bash
# Add the plugin marketplace
/plugin marketplace add camdenclark/vibetracker

# Install the tracker plugin
/plugin install tracker
```

That's it! The plugin automatically captures session data.

For manual installation or more options, see the [full Claude Code guide]({{< relref "/docs/installation/claude" >}}).

## Other Agentic Coding Tools

Vibetracker also supports:

- **[Codex]({{< relref "/docs/installation/codex" >}})** - OpenAI's coding agent
- **[Gemini CLI]({{< relref "/docs/installation/gemini" >}})** - Google's Gemini CLI

## Prerequisites

All installations require [Bun](https://bun.sh):

```bash
curl -fsSL https://bun.sh/install | bash
```

{{< button relref="/docs" >}}Full Documentation{{< /button >}}
