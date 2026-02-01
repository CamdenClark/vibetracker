---
title: "Reference"
weight: 4
---

# Reference

Technical reference documentation for Vibetracker's data model and query capabilities.

## Sections

- **[Event Schema]({{< relref "event-schema" >}})** - Complete documentation of all event fields and their types
- **[Querying Events]({{< relref "querying" >}})** - SQL queries to analyze your agentic coding data

## Overview

Vibetracker stores all agentic coding activity as events in a SQLite database at `~/.vibetracker/events.db`. Each event represents a discrete action during a coding session, such as:

- Session lifecycle (start/end)
- AI model turns and token usage
- Tool invocations (file operations, bash commands, web fetches)
- Errors and debugging information

The consistent event schema allows you to query and analyze data across different agent sources (Claude Code, Codex, Gemini, Cursor) using standard SQL.
