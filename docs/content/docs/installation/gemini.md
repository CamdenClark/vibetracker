---
title: "Gemini CLI"
weight: 3
---

# Gemini CLI Installation

Install Vibetracker to track your [Gemini CLI](https://github.com/google-gemini/gemini-cli) sessions.

## Install the Package

```bash
bun add -g vibetracker
```

## Manual Ingestion

After a Gemini session, run:

```bash
bunx vibetracker ingest --source gemini
```

This automatically finds the most recent session transcript from `~/.gemini/tmp/`.

### Specify a Transcript

To ingest a specific session:

```bash
bunx vibetracker ingest --source gemini --transcript ~/.gemini/tmp/<project-hash>/chats/session-abc123.json
```

## Automatic Ingestion with Hooks

If Gemini CLI supports hooks, configure automatic ingestion by piping the hook payload:

```bash
bunx vibetracker ingest --source gemini
```

The ingester reads from stdin and extracts:
- `session_id` - Session identifier
- `transcript_path` - Path to the transcript file
- `cwd` - Working directory
- `hook_event_name` - Name of the hook event
- `timestamp` - Event timestamp

## Transcript Location

Gemini CLI stores session transcripts in:

```
~/.gemini/tmp/<project-hash>/chats/session-<session-id>.json
```

Each transcript is a JSON file containing:
- `sessionId` - Unique session identifier
- `projectHash` - Hash of the project directory
- `startTime` / `lastUpdated` - Session timestamps
- `messages` - Array of user, assistant, error, and info messages

## Captured Data

Vibetracker extracts from Gemini sessions:
- Token usage (input, output, cached, thoughts, tool)
- Tool calls with arguments and results
- Model information per turn
- Error events

## Verify Installation

Check that events were captured:

```bash
bunx vibetracker status
```
