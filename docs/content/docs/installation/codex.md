---
title: "Codex"
weight: 2
---

# Codex Installation

Install Vibetracker to track your [OpenAI Codex](https://openai.com/codex) sessions.

## Install the Package

```bash
bun add -g vibetracker
```

## Manual Ingestion

After a Codex session, run:

```bash
bunx vibetracker ingest --source codex
```

This automatically finds the most recent session transcript from `~/.codex/sessions/`.

### Specify a Transcript

To ingest a specific session:

```bash
bunx vibetracker ingest --source codex --transcript ~/.codex/sessions/2024/01/15/session-abc123.jsonl
```

## Automatic Ingestion with Hooks

If Codex supports hooks, you can configure automatic ingestion by piping the hook payload:

```bash
bunx vibetracker ingest --source codex
```

The ingester reads from stdin and extracts:
- `session_id` - Session identifier
- `transcript_path` - Path to the transcript file
- `cwd` - Working directory

## Transcript Location

Codex stores session transcripts in:

```
~/.codex/sessions/YYYY/MM/DD/<session-id>.jsonl
```

Each line in the JSONL file contains one of:
- `session_meta` - Session metadata including git info
- `turn_context` - Model and approval settings per turn
- `response_item` - Messages and function calls
- `event_msg` - User messages and token counts

## Verify Installation

Check that events were captured:

```bash
bunx vibetracker status
```
