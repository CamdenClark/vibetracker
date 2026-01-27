# Vibe Tracker

A CLI tool that captures events from agentic coding sessions and makes them queryable across your team—no SaaS, no containers, just object storage you already have.

## The Problem

Teams using agentic coders (Claude Code, Codex, OpenCode, Cursor) have no unified way to understand what's happening across sessions. Questions like:

- How many tokens did the team burn this week?
- What's the success/error rate by agent type?
- Which files get touched most often?
- How long do sessions last on average?

Currently unanswerable without building custom tooling.

## The Solution

1. Hook into agentic coders at session end
2. Parse transcripts into a normalized event format
3. Store locally in SQLite
4. Sync to object storage (S3/GCS/R2/ABS) at team-accessible paths
5. Query across your whole team with DuckDB

No vendor lock-in. No infrastructure to deploy. Just structured events in Parquet files on storage you already use.

---

## Core Concepts

### Event Model

One wide table, nullable columns. Filter by `event_type`. DuckDB handles sparse wide tables efficiently.

```typescript
interface VibeEvent {
  // Identity
  id: string                      // UUIDv7 (timestamp-sortable)
  timestamp: string               // ISO8601

  // Context
  user_id: string
  team_id?: string
  machine_id?: string
  session_id: string              // UUIDv7, groups events from one agent run

  // Classification
  event_type: EventType
  source: AgentSource

  // Session fields
  session_cwd?: string
  session_git_repo?: string
  session_git_branch?: string
  session_duration_ms?: number

  // Turn fields
  turn_index?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  model?: string

  // Tool call fields
  tool_name?: ToolName            // Normalized
  tool_name_raw?: string          // Original from agent
  tool_input?: string             // Full tool input (JSON stringified)
  tool_output?: string            // Full tool output (JSON stringified)
  tool_duration_ms?: number
  tool_success?: boolean

  // MCP-specific
  mcp_server?: string
  mcp_tool_name?: string

  // File operations
  file_path?: string
  file_action?: 'create' | 'update' | 'delete'
  file_lines_added?: number
  file_lines_removed?: number

  // Errors
  error_message?: string
  error_code?: string

  // Escape hatch
  meta?: Record<string, unknown>  // Source-specific extras

  // Sync tracking
  synced_at?: string              // Null until synced
}
```

### Event Types

```typescript
type EventType =
  | 'session_start'
  | 'session_end'
  | 'prompt'          // User submitted a prompt
  | 'turn_start'      // Agent started responding
  | 'turn_end'        // Agent finished responding
  | 'tool_call'       // Tool was invoked
  | 'error'
```

### Normalized Tool Names

Different agents use different tool names. We normalize to a canonical set:

```typescript
type ToolName =
  | 'bash'
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'file_delete'
  | 'grep'
  | 'glob'
  | 'list_dir'
  | 'web_fetch'
  | 'web_search'
  | 'task'            // Subagent/subtask
  | 'mcp_tool'        // MCP tools
  | 'other'
```

**Tool name mapping:**

| Canonical     | Claude Code      | Codex        | OpenCode | Cursor      |
|---------------|------------------|--------------|----------|-------------|
| `bash`        | Bash             | shell_exec   | bash     | terminal    |
| `file_read`   | Read             | read_file    | read     | read_file   |
| `file_write`  | Write            | write_file   | write    | write_file  |
| `file_edit`   | Edit, MultiEdit  | patch_file   | edit     | edit_file   |
| `file_delete` | —                | delete_file  | —        | —           |
| `grep`        | Grep             | grep         | grep     | search      |
| `glob`        | Glob             | glob         | glob     | —           |
| `list_dir`    | ListDir          | list_dir     | ls       | —           |
| `web_fetch`   | WebFetch         | web_fetch    | webfetch | —           |
| `web_search`  | WebSearch        | web_search   | —        | —           |
| `task`        | Task             | —            | task     | —           |

We store both `tool_name` (normalized) and `tool_name_raw` (original) so you can query either.

### Agent Sources

```typescript
type AgentSource =
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'cursor'
  | 'other'
```

---

## Architecture

### Data Flow

```
Agent hook fires (session end, idle, turn complete)
        ↓
Hook calls: bunx vibe-tracker ingest --source claude
        ↓
Parse transcript file → normalized events
        ↓
Dedupe by (session_id, timestamp, event_type, tool_name_raw)
        ↓
INSERT OR IGNORE into local SQLite (~/.vibe-tracker/events.db)
        ↓
[Later] bunx vibe-tracker sync
        ↓
For each day with unsynced events:
  - Export day's events to Parquet
  - Upload to Hive-partitioned path in object storage
  - Mark events as synced
        ↓
Team queries with DuckDB directly against object storage
```

### Why This Architecture

**Why parse transcripts instead of real-time hooks?**
- One integration point per agent (just find the transcript)
- No complex hook configuration
- Works even when hooks aren't available
- Transcript has everything—you don't miss events
- Simpler to debug

**Why SQLite locally?**
- Battle-tested for high-frequency small writes
- Great concurrent write handling
- `bun:sqlite` is built-in, zero dependencies
- Easy to inspect with any SQLite tool
- Handles deduplication with `INSERT OR IGNORE`

**Why Parquet for sync?**
- DuckDB reads it natively and efficiently
- Columnar format = fast analytical queries
- Good compression
- Industry standard

**Why object storage with Hive partitioning?**
- Teams already have it (S3/GCS/R2/ABS)
- No infrastructure to deploy
- DuckDB can query it directly via httpfs
- Hive partitioning enables partition pruning (only read relevant files)
- Simple permission model (bucket access)

---

## Storage Layout

### Local Storage

SQLite database at `~/.vibe-tracker/events.db`:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,              -- UUIDv7
  timestamp TEXT NOT NULL,          -- ISO8601
  user_id TEXT NOT NULL,
  team_id TEXT,
  machine_id TEXT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  -- ... all other fields nullable
  meta TEXT,                        -- JSON blob
  synced_at TEXT                    -- NULL until synced
);

-- Deduplication index
CREATE UNIQUE INDEX idx_events_dedup
ON events(session_id, timestamp, event_type, tool_name_raw);

-- Query indexes
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_synced ON events(synced_at);
```

### Remote Storage (Hive Partitioned)

```
s3://bucket/{team_id}/
├── user={user_id}/
│   ├── year=2025/
│   │   ├── month=11/
│   │   │   ├── day=15/events.parquet
│   │   │   └── day=16/events.parquet
│   │   └── month=12/
│   │       ├── day=01/events.parquet
│   │       └── ...
│   └── year=2026/
│       └── month=01/
│           └── day=26/events.parquet
├── user={another_user}/
│   └── ...
```

**Sync logic:**

```typescript
// Find days with unsynced events
const days = db.query(`
  SELECT DISTINCT
    strftime('%Y', timestamp) as year,
    strftime('%m', timestamp) as month,
    strftime('%d', timestamp) as day
  FROM events
  WHERE synced_at IS NULL
`).all()

for (const { year, month, day } of days) {
  // Get ALL events for this day (full rebuild)
  const events = db.query(`
    SELECT * FROM events
    WHERE strftime('%Y-%m-%d', timestamp) = ?
  `, [`${year}-${month}-${day}`]).all()

  // Write Parquet (overwrites if exists)
  const path = `s3://bucket/${teamId}/user=${userId}/year=${year}/month=${month}/day=${day}/events.parquet`
  await writeParquet(events, path)

  // Mark as synced
  db.exec(`
    UPDATE events SET synced_at = datetime('now')
    WHERE strftime('%Y-%m-%d', timestamp) = ?
  `, [`${year}-${month}-${day}`])
}
```

**Query examples:**

```sql
-- All events for one user, one month (partition pruning)
SELECT * FROM read_parquet(
  's3://bucket/acme-eng/user=CamdenClark/year=2025/month=12/**/*.parquet',
  hive_partitioning=true
)

-- Team-wide token usage last 7 days
SELECT user, SUM(total_tokens) as tokens
FROM read_parquet('s3://bucket/acme-eng/**/*.parquet', hive_partitioning=true)
WHERE year = '2026' AND month = '01' AND CAST(day AS INT) >= 20
GROUP BY user

-- Tool usage across entire team history
SELECT tool_name, COUNT(*) as count
FROM read_parquet('s3://bucket/acme-eng/**/*.parquet', hive_partitioning=true)
WHERE event_type = 'tool_call'
GROUP BY tool_name
ORDER BY count DESC

-- Error rate by agent source
SELECT source,
       COUNT(*) FILTER (WHERE event_type = 'error') as errors,
       COUNT(*) as total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE event_type = 'error') / COUNT(*), 2) as error_rate
FROM read_parquet('s3://bucket/acme-eng/**/*.parquet', hive_partitioning=true)
GROUP BY source
```

---

### Deduplication Strategy

Sessions can resume, so the same session may be ingested multiple times with new events.

**Local dedup (SQLite):**
- Unique index on `(session_id, timestamp, event_type, tool_name_raw)`
- `INSERT OR IGNORE` skips events we've already seen
- Re-ingesting a session only adds genuinely new events

**Remote dedup (Parquet):**
- Full rebuild per day: sync exports ALL events for that day, overwrites the file
- Idempotent: run sync 10 times, same result
- No append-only complexity, no read-modify-write race conditions

### Transcript Access by Agent

Each agent has different mechanisms for accessing session data. This is critical for how vibe-tracker ingests events.

#### Claude Code ✅ Easiest

**Hook payload includes transcript path directly:**

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf.jsonl",
  "cwd": "/Users/...",
  "hook_event_name": "SessionEnd",
  "reason": "exit"
}
```

The hook receives JSON via stdin with `transcript_path` — just parse and read the file directly.

**Integration:** Hook calls `bunx vibe-tracker ingest --source claude`, CLI reads stdin, extracts `transcript_path`, parses the JSONL file.

---

#### Codex ⚠️ Requires Lookup

**Hook payload does NOT include transcript path:**

```json
{
  "type": "agent-turn-complete",
  "thread-id": "7f9f9a2e-1b3c-4c7a-9b0e-...",
  "last-assistant-message": "...",
  "input-messages": [...]
}
```

**Transcript locations:**
- `~/.codex/history.jsonl` (global history)
- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (per-session)

**Integration options:**
1. Find transcript file by `thread-id` matching
2. Find latest session file by mtime
3. Parse `history.jsonl` filtering by `thread-id`

**Config:** Uses `notify` in `~/.codex/config.toml`:
```toml
notify = ["bunx", "vibe-tracker", "ingest", "--source", "codex"]
```

---

#### OpenCode ⚠️ Requires SDK or CLI

**Plugin receives context object with SDK access:**

```typescript
export default async ({ client }) => ({
  event: async ({ event }) => {
    if (event.type === 'session.idle') {
      const sessionId = event.properties?.sessionId
      // Option 1: Use SDK to fetch messages
      const messages = await client.session.messages({ path: { id: sessionId } })
      // Option 2: Call CLI export
      await $`opencode session export ${sessionId} -f json -o /tmp/session.json`
    }
  }
})
```

**Integration options:**
1. SDK: `client.session.messages()` returns all messages for a session
2. CLI: `opencode session export <sessionId> -f json` exports to file
3. Storage: Sessions stored in SQLite at `~/.local/share/opencode/` (platform-dependent)

---

#### Cursor ⚠️ Limited Access

**Hook payload does NOT include transcript path:**

```json
{
  "conversation_id": "cdefee2d-2727-4b73-bf77-d9d830f31d2a",
  "generation_id": "23681cf0-a483-49ab-9748-36044efcef52",
  "hook_event_name": "stop",
  "workspace_roots": ["/Users/schacon/projects/example"]
}
```

**Available hooks:** `beforeSubmitPrompt`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `afterFileEdit`, `stop`

**Transcript location:** Unknown/undocumented. Cursor stores session data internally but doesn't expose a path.

**Integration options:**
1. Build transcript from hook events (capture `beforeSubmitPrompt`, `afterFileEdit`, etc. throughout session)
2. Wait for Cursor to add `sessionStart`/`sessionEnd` hooks with transcript access (currently not supported)

**Note:** Cursor hooks are beta and still evolving. `sessionStart` and `sessionEnd` are not yet valid hook types.

---

### Summary: Transcript Access

| Agent       | Path in Hook? | Access Method |
|-------------|---------------|---------------|
| Claude Code | ✅ Yes | Direct file read from `transcript_path` |
| Codex       | ❌ No | Find file by `thread-id` or mtime in `~/.codex/sessions/` |
| OpenCode    | ❌ No | SDK `client.session.messages()` or `opencode session export` |
| Cursor      | ❌ No | Build from individual hook events (no full transcript access) |

---

## CLI Design

```bash
# Ingest from Claude Code (reads stdin for hook payload with transcript_path)
bunx vibe-tracker ingest --source claude

# Ingest from Claude Code with explicit transcript path
bunx vibe-tracker ingest --source claude --transcript /path/to/session.jsonl

# Ingest from Codex (finds latest session or by thread ID)
bunx vibe-tracker ingest --source codex
bunx vibe-tracker ingest --source codex --session-id 7f9f9a2e-1b3c-4c7a

# Ingest from OpenCode (reads from exported JSON)
bunx vibe-tracker ingest --source opencode --transcript /tmp/session.json

# Sync unsynced events to object storage
bunx vibe-tracker sync

# Sync specific date range
bunx vibe-tracker sync --since 2025-12-01 --until 2025-12-31

# Force re-sync (re-upload even if already synced)
bunx vibe-tracker sync --force

# Query locally
bunx vibe-tracker query "SELECT * FROM events WHERE event_type = 'tool_call'"

# Show sync status
bunx vibe-tracker status

# Initialize config
bunx vibe-tracker init
```

### Input Modes

The `ingest` command supports multiple input modes depending on the agent:

1. **Stdin (default for Claude Code):** Reads hook payload JSON from stdin, extracts `transcript_path`
2. **Explicit transcript:** `--transcript /path/to/file` for direct file access
3. **Session ID lookup:** `--session-id <id>` to find transcript by ID (Codex, OpenCode)
4. **Auto-discovery:** No args = find latest transcript by mtime

### Sync Behavior

The `sync` command:
1. Finds all days with unsynced events (`synced_at IS NULL`)
2. For each day, exports ALL events for that day to Parquet
3. Uploads to Hive-partitioned path: `s3://bucket/{team}/user={user}/year={Y}/month={M}/day={D}/events.parquet`
4. Marks those events as synced

**Idempotent:** Running sync multiple times produces the same result. Safe to run in cron or CI.

### Configuration

`~/.vibe-tracker/config.json`:

```json
{
  "user_id": "CamdenClark",
  "team_id": "acme-eng",
  "machine_id": "camden-macbook",
  "storage": {
    "provider": "s3",
    "bucket": "acme-vibe-tracker",
    "region": "us-east-1"
  }
}
```

**Supported storage providers:**
- `s3` — Amazon S3
- `gcs` — Google Cloud Storage
- `abs` — Azure Blob Storage
- `r2` — Cloudflare R2

Credentials are read from environment variables or cloud provider defaults (AWS credentials file, gcloud auth, etc.).

---

## Installation & Distribution

Different agents have different plugin/hook mechanisms. We meet people where they are.

### Core CLI

```bash
# One-time install
bun add -g vibe-tracker

# Or run directly
bunx vibe-tracker ingest --source claude
```

### Agent-Specific Plugins

**Claude Code** — Plugin or settings.json hook

`.claude/settings.json`:
```json
{
  "hooks": {
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "bunx vibe-tracker ingest --source claude"
      }]
    }]
  }
}
```

The hook payload (including `transcript_path`) is passed via stdin automatically.

---

**Codex** — Notify config in `~/.codex/config.toml`

```toml
notify = ["bunx", "vibe-tracker", "ingest", "--source", "codex"]
```

The CLI receives `thread-id` in the JSON payload and finds the corresponding transcript file.

---

**OpenCode** — Plugin (`.opencode/plugin/vibe.ts`)

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const VibeTrackerPlugin: Plugin = async ({ client, $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === 'session.idle') {
        const sessionId = (event as any).session_id
        if (sessionId) {
          // Export session to temp file, then ingest
          await $`opencode session export ${sessionId} -f json -o /tmp/vibe-session.json`
          await $`bunx vibe-tracker ingest --source opencode --transcript /tmp/vibe-session.json`
        }
      }
    }
  }
}

export default VibeTrackerPlugin
```

---

**Cursor** — `.cursor/hooks.json`

```json
{
  "version": 1,
  "hooks": {
    "stop": [{
      "command": "bunx vibe-tracker ingest --source cursor"
    }]
  }
}
```

**Note:** Cursor doesn't provide full transcript access, so we capture what we can from the `stop` event payload (conversation_id, workspace_roots). Full transcript support pending Cursor adding more hook capabilities.

### Repo-Level Setup

Drop the plugin config into your repo, and everyone on the team gets automatic tracking:

```
your-project/
├── .claude/
│   └── settings.json     # Claude Code hook
├── .opencode/
│   └── plugin/
│       └── vibe.ts       # OpenCode plugin
└── .cursor/
    └── hooks.json        # Cursor hook
```

No global daemon. No manual runs. Just works.

---

## Project Structure

```
vibe-tracker/
├── src/
│   ├── cli.ts              # CLI entry point (commander)
│   ├── schema.ts           # TypeScript types
│   ├── db.ts               # SQLite operations (init, insert, query)
│   ├── config.ts           # Config loading (~/.vibe-tracker/config.json)
│   ├── ingest/
│   │   ├── index.ts        # Ingest orchestration
│   │   ├── claude.ts       # Parse Claude Code transcripts
│   │   ├── codex.ts        # Parse Codex transcripts
│   │   ├── opencode.ts     # Parse OpenCode transcripts
│   │   └── cursor.ts       # Parse Cursor hook events
│   ├── normalize.ts        # Tool name normalization
│   └── sync/
│       ├── index.ts        # Sync orchestration
│       ├── parquet.ts      # Parquet file writing
│       └── storage/
│           ├── s3.ts       # S3 upload
│           ├── gcs.ts      # GCS upload
│           ├── abs.ts      # Azure Blob upload
│           └── r2.ts       # Cloudflare R2 upload
│
├── plugins/
│   ├── claude/             # Claude Code plugin
│   │   └── settings.json   # Hook configuration
│   ├── opencode/           # OpenCode plugin
│   │   └── vibe.ts
│   └── cursor/             # Cursor hooks
│       └── hooks.json
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Open Questions

1. **Cursor transcript access** — Cursor doesn't expose transcript paths in hooks. Options: (a) build transcript from individual hook events throughout session, (b) wait for Cursor to add better hooks, (c) skip Cursor support initially.

2. **Codex transcript discovery** — Need to verify the exact mapping from `thread-id` to transcript file path. May need to scan `~/.codex/sessions/` directories.

3. **User/machine ID** — Auto-detect from git config (`user.name`, `user.email`)? Require explicit config? Use hostname for machine_id?

4. **Cost tracking** — Should we compute `cost_usd` from tokens + model? Requires maintaining a pricing table that stays current.

5. **OpenCode storage format** — OpenCode uses SQLite internally. Should we read from their DB directly, or always use the `session export` CLI?

6. **Parquet library** — What's the best way to write Parquet from Bun/Node? Options: `parquetjs`, `duckdb` node bindings, shell out to `duckdb` CLI.

7. **S3 auth in CI** — How do teams set up sync in CI/CD? Document patterns for GitHub Actions, etc.

8. **Conflict resolution** — If two machines sync the same user's day simultaneously, last write wins. Is this acceptable? (Probably yes — events are additive, full rebuild means no data loss.)

9. **Storage size with full tool I/O** — Full tool inputs/outputs can be large (file contents, bash output). May need to monitor Parquet file sizes and consider compression settings. Could add optional truncation flag later if needed.

---

## Future Ideas

- `vibe-tracker dashboard` — Local web UI for exploring your data
- VS Code extension that shows session stats
- GitHub Action for team-wide reports
- Alerts (Slack/Discord) when error rates spike
- Token budget tracking per project/team
