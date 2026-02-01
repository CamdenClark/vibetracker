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

## Supported Tools

Vibetracker works with multiple agentic coding tools:

- [Claude Code]({{< relref "installation/claude" >}}) - Anthropic's CLI for Claude
- [Codex]({{< relref "installation/codex" >}}) - OpenAI's coding agent
- [Gemini CLI]({{< relref "installation/gemini" >}}) - Google's Gemini CLI

## Quick Start

{{< button relref="/docs/installation" >}}Get Started{{< /button >}}

## Reference

- [Event Schema]({{< relref "reference/event-schema" >}}) - Complete documentation of all event fields
- [Querying Events]({{< relref "reference/querying" >}}) - SQL queries to analyze your data
