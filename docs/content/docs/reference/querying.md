---
title: "Querying Events"
weight: 2
---

# Querying Events

Vibetracker stores events in SQLite at `~/.vibetracker/events.db`. You can query this data using the CLI or directly with SQLite tools.

## Using the CLI

The `query` command executes SQL and returns JSON:

```bash
vibetracker query "SELECT * FROM events LIMIT 5"
```

## Direct Database Access

You can also use any SQLite client:

```bash
sqlite3 ~/.vibetracker/events.db "SELECT * FROM events LIMIT 5"
```

Or with Bun:

```typescript
import { Database } from "bun:sqlite"

const db = new Database(process.env.HOME + "/.vibetracker/events.db")
const events = db.query("SELECT * FROM events LIMIT 5").all()
```

---

## Common Queries

### Session Statistics

**Total sessions and events:**

```sql
SELECT
  COUNT(DISTINCT session_id) as sessions,
  COUNT(*) as total_events
FROM events
```

**Sessions per day:**

```sql
SELECT
  DATE(timestamp) as day,
  COUNT(DISTINCT session_id) as sessions
FROM events
GROUP BY DATE(timestamp)
ORDER BY day DESC
```

**Average session duration:**

```sql
SELECT
  AVG(session_duration_ms) / 1000.0 / 60.0 as avg_minutes
FROM events
WHERE event_type = 'session_end'
  AND session_duration_ms IS NOT NULL
```

### Token Usage

**Total tokens by model:**

```sql
SELECT
  model,
  SUM(prompt_tokens) as prompt_tokens,
  SUM(completion_tokens) as completion_tokens,
  SUM(total_tokens) as total_tokens
FROM events
WHERE total_tokens IS NOT NULL
GROUP BY model
ORDER BY total_tokens DESC
```

**Tokens per session:**

```sql
SELECT
  session_id,
  SUM(total_tokens) as tokens,
  COUNT(*) as turns
FROM events
WHERE event_type = 'turn_end'
GROUP BY session_id
ORDER BY tokens DESC
LIMIT 10
```

**Daily token usage:**

```sql
SELECT
  DATE(timestamp) as day,
  SUM(total_tokens) as tokens
FROM events
WHERE total_tokens IS NOT NULL
GROUP BY DATE(timestamp)
ORDER BY day DESC
```

### Tool Usage

**Tool call frequency:**

```sql
SELECT
  tool_name,
  COUNT(*) as calls
FROM events
WHERE event_type = 'tool_call'
GROUP BY tool_name
ORDER BY calls DESC
```

**Tool success rate:**

```sql
SELECT
  tool_name,
  COUNT(*) as total,
  SUM(CASE WHEN tool_success = 1 THEN 1 ELSE 0 END) as succeeded,
  ROUND(100.0 * SUM(CASE WHEN tool_success = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
FROM events
WHERE event_type = 'tool_call'
GROUP BY tool_name
ORDER BY total DESC
```

**Average tool duration:**

```sql
SELECT
  tool_name,
  ROUND(AVG(tool_duration_ms), 0) as avg_ms,
  COUNT(*) as calls
FROM events
WHERE event_type = 'tool_call'
  AND tool_duration_ms IS NOT NULL
GROUP BY tool_name
ORDER BY avg_ms DESC
```

**Slowest tool calls:**

```sql
SELECT
  tool_name,
  tool_input,
  tool_duration_ms
FROM events
WHERE event_type = 'tool_call'
  AND tool_duration_ms IS NOT NULL
ORDER BY tool_duration_ms DESC
LIMIT 10
```

### File Operations

**Most edited files:**

```sql
SELECT
  file_path,
  COUNT(*) as edits,
  SUM(file_lines_added) as lines_added,
  SUM(file_lines_removed) as lines_removed
FROM events
WHERE file_path IS NOT NULL
GROUP BY file_path
ORDER BY edits DESC
LIMIT 20
```

**File operations by type:**

```sql
SELECT
  file_action,
  COUNT(*) as count
FROM events
WHERE file_action IS NOT NULL
GROUP BY file_action
```

**Net lines of code changed:**

```sql
SELECT
  SUM(COALESCE(file_lines_added, 0)) as added,
  SUM(COALESCE(file_lines_removed, 0)) as removed,
  SUM(COALESCE(file_lines_added, 0)) - SUM(COALESCE(file_lines_removed, 0)) as net
FROM events
WHERE file_path IS NOT NULL
```

### Git Context

**Sessions by repository:**

```sql
SELECT
  session_git_repo,
  COUNT(DISTINCT session_id) as sessions,
  COUNT(*) as events
FROM events
WHERE session_git_repo IS NOT NULL
GROUP BY session_git_repo
ORDER BY sessions DESC
```

**Activity by branch:**

```sql
SELECT
  session_git_branch,
  COUNT(DISTINCT session_id) as sessions
FROM events
WHERE session_git_branch IS NOT NULL
GROUP BY session_git_branch
ORDER BY sessions DESC
LIMIT 20
```

### Error Analysis

**Error frequency:**

```sql
SELECT
  error_code,
  error_message,
  COUNT(*) as occurrences
FROM events
WHERE event_type = 'error'
GROUP BY error_code, error_message
ORDER BY occurrences DESC
LIMIT 20
```

**Sessions with errors:**

```sql
SELECT
  session_id,
  COUNT(*) as error_count
FROM events
WHERE event_type = 'error'
GROUP BY session_id
ORDER BY error_count DESC
LIMIT 10
```

### Agent Source Comparison

**Events by source:**

```sql
SELECT
  source,
  COUNT(*) as events,
  COUNT(DISTINCT session_id) as sessions
FROM events
GROUP BY source
```

**Token usage by source:**

```sql
SELECT
  source,
  SUM(total_tokens) as tokens,
  COUNT(DISTINCT session_id) as sessions,
  ROUND(1.0 * SUM(total_tokens) / COUNT(DISTINCT session_id), 0) as tokens_per_session
FROM events
WHERE total_tokens IS NOT NULL
GROUP BY source
```

### Subagent Analysis

**Subagent usage by type:**

```sql
SELECT
  agent_type,
  COUNT(*) as spawned
FROM events
WHERE agent_type IS NOT NULL
GROUP BY agent_type
ORDER BY spawned DESC
```

---

## Filtering Tips

### By Time Range

```sql
-- Last 24 hours
WHERE timestamp > datetime('now', '-1 day')

-- Last 7 days
WHERE timestamp > datetime('now', '-7 days')

-- Specific date range
WHERE timestamp BETWEEN '2025-01-01' AND '2025-01-31'

-- Today only
WHERE DATE(timestamp) = DATE('now')
```

### By Session

```sql
-- Specific session
WHERE session_id = 'abc123'

-- Sessions in a repository
WHERE session_git_repo LIKE '%vibetracker%'
```

### By Event Type

```sql
-- Only tool calls
WHERE event_type = 'tool_call'

-- Session boundaries
WHERE event_type IN ('session_start', 'session_end')
```

---

## Table Schema

The `events` table contains all fields from the [Event Schema]({{< relref "event-schema" >}}). Columns map directly to event fields with the same names.

**Indexes available for performance:**

| Index | Columns |
|-------|---------|
| `idx_events_timestamp` | `timestamp` |
| `idx_events_session` | `session_id` |
| `idx_events_synced` | `synced_at` |
| `idx_events_agent` | `agent_id` |
