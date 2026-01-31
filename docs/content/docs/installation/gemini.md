---
title: "Gemini CLI"
weight: 3
---

# Gemini CLI Installation

Install Vibetracker to track your [Gemini CLI](https://github.com/google-gemini/gemini-cli) sessions.

## Quick Install (Recommended)

Run the install command to automatically configure Gemini:

```bash
bunx vibetracker install --source gemini
```

This adds the AfterAgent hook to `~/.gemini/settings.json`.

## Manual Installation

### Install the Package

```bash
bun add -g vibetracker
```

### Configure Hooks

Add the following to your `~/.gemini/settings.json`:

```json
{
  "hooks": {
    "AfterAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bunx vibetracker ingest --source gemini",
            "name": "vibetracker",
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
```

The `AfterAgent` hook fires when the agent loop completes, automatically capturing the session data. The hook receives session metadata via stdin including `session_id`, `transcript_path`, `cwd`, and `timestamp`.

For project-specific configuration, you can also add hooks to `.gemini/settings.json` in your project directory.

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
