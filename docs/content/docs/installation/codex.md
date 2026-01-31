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

## Configure Hooks

Add the following to your `~/.codex/config.toml`:

```toml
notify = ["bunx", "vibetracker", "ingest", "--source", "codex"]
```

The notify hook triggers on `agent-turn-complete` events, automatically capturing session data. The hook receives a JSON payload via stdin containing `session_id`, `transcript_path`, and `cwd`.

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
