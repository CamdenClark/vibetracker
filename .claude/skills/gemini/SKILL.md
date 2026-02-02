---
name: gemini
description: Development guide for VibeTracker's Gemini CLI integration - running Gemini headless, reading transcripts, and testing the parser.
user-invocable: false
---

# Gemini CLI Development Guide

Reference for developing VibeTracker against Gemini CLI.

## Running Gemini Headless

Use `-p` or `--prompt` to run without TUI:

```bash
# Simple prompt
gemini -p "What files are in this directory?"

# With auto-approval (no confirmation prompts)
gemini -p "List all TypeScript files" --yolo

# Get JSON output for parsing
gemini -p "Explain this code" --output-format json

# Streaming JSON events
gemini -p "Review this file" --output-format stream-json

# Pipe file content
cat src/ingest/gemini.ts | gemini -p "Summarize this parser"

# Specify model
gemini -p "Hello" -m gemini-2.5-flash
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `-p`, `--prompt` | Run headless with prompt |
| `-y`, `--yolo` | Auto-approve all tool actions |
| `--output-format json` | Structured JSON response |
| `--output-format stream-json` | Newline-delimited JSON events |
| `-m`, `--model` | Select model |
| `--debug` | Enable debug output |

## Reading Transcripts

After Gemini runs, transcripts are saved at:
```
~/.gemini/tmp/<project_hash>/chats/session-*.json
```

Find the most recent transcript:
```bash
ls -lt ~/.gemini/tmp/*/chats/session-*.json | head -1
```

Or use the VibeTracker helper:
```typescript
import { findGeminiTranscript } from './src/ingest/gemini'
const path = await findGeminiTranscript()  // finds most recent
```

## Transcript Format

```typescript
interface GeminiTranscript {
  sessionId: string
  projectHash: string
  startTime: string
  lastUpdated: string
  messages: GeminiMessage[]
}

// Message types: 'user' | 'gemini' | 'error' | 'info'
```

### User Message
```json
{ "type": "user", "content": "prompt text", "timestamp": "..." }
```

### Assistant Message
```json
{
  "type": "gemini",
  "content": "response text",
  "toolCalls": [...],
  "tokens": { "input": 100, "output": 50, "cached": 0, "thoughts": 0, "tool": 10, "total": 160 },
  "model": "gemini-2.5-pro",
  "timestamp": "..."
}
```

### Tool Call
```json
{
  "id": "call_123",
  "name": "run_shell_command",
  "args": { "command": "ls -la" },
  "result": [{ "functionResponse": { "output": "..." } }],
  "status": "success",
  "timestamp": "..."
}
```

## Development Workflow

### 1. Run Gemini and Capture Transcript

```bash
# Run a command that uses tools
gemini -p "List the files in src/" --yolo

# Find the transcript
TRANSCRIPT=$(ls -t ~/.gemini/tmp/*/chats/session-*.json | head -1)
echo $TRANSCRIPT
```

### 2. Parse with VibeTracker

```typescript
import { parseGeminiTranscript } from './src/ingest/gemini'

const result = await parseGeminiTranscript(transcriptPath)
console.log(result.events)
```

### 3. Compare to Expected Events

```typescript
// Check tool calls parsed correctly
const toolCalls = result.events.filter(e => e.event_type === 'tool_call')
for (const tc of toolCalls) {
  console.log(`Tool: ${tc.tool_name_raw} -> ${tc.tool_name}`)
  console.log(`Command: ${tc.bash_command}`)
}
```

## Tool Name Mapping

| Gemini Raw | VibeTracker Canonical |
|------------|----------------------|
| `run_shell_command` | `bash` |
| `read_file` | `file_read` |
| `write_file` | `file_write` |
| `replace` | `file_edit` |
| `search_file_content` | `grep` |
| `glob` | `glob` |
| `list_directory` | `list_dir` |
| `web_fetch` | `web_fetch` |
| `google_web_search` | `web_search` |
| `delegate_to_agent` | `task` |

## Hook Payload

When Gemini triggers hooks, it sends via stdin:

```typescript
interface GeminiHookPayload {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string  // "AfterAgent"
  timestamp: string
}
```

Test hook parsing:
```typescript
import { parseGeminiHookPayload } from './src/ingest/gemini'

const payload = await parseGeminiHookPayload(stdinJson)
const transcript = await parseGeminiTranscript(payload.transcript_path, payload)
```

## Testing

```bash
# Run Gemini tests
bun test src/ingest/gemini.test.ts

# Run all tests
bun test
```

## Authentication

Check for API key in:
1. `GEMINI_API_KEY` env var
2. `.env` in project root
3. `~/.gemini/.env`

Docs: https://geminicli.com/docs/get-started/authentication/

## Key Files

- `src/ingest/gemini.ts` - Parser implementation
- `src/ingest/gemini.test.ts` - Parser tests
- `src/install.ts` - Hook installation
