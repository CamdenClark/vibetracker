# Unified Schema Design for Multi-Assistant Support

## Goals

1. Support multiple AI coding assistants (Claude Code, Codex CLI, Cursor, Gemini, etc.)
2. Preserve provider-specific metadata while maintaining a common core structure
3. Enable cross-provider analytics and querying
4. Make it easy to add new providers via adapters

## Provider Comparison

### Claude Code
- **Format**: JSONL with message objects
- **Structure**: `{ type, sessionId, uuid, message: { role, content, usage }, timestamp }`
- **Tool Calls**: Embedded in `message.content` array as `tool_use` blocks
- **Agents**: Subagents with dedicated trajectory files (`agent-{id}.jsonl`)
- **Metadata**: Session-level metadata in message stream
- **Token Tracking**: Detailed (input, output, cache_read, cache_creation)

### Codex CLI
- **Format**: JSONL with typed events
- **Structure**: `{ timestamp, type, payload }`
- **Event Types**: `session_meta`, `response_item`, `event_msg`, `turn_context`
- **Tool Calls**: `function_call` in response items
- **Agents**: Not clear if similar agent model exists
- **Metadata**: Dedicated `session_meta` event with git info, cli version, model provider
- **Token Tracking**: Similar structure in token_count events
- **Privacy**: Some content encrypted (`encrypted_content` field)
- **Git**: Ghost commits for tracking file state

### Key Differences to Handle

1. **Event typing**: Claude uses message types, Codex uses event/payload structure
2. **Tool call format**: Different embedding strategies
3. **Metadata location**: Inline vs. dedicated events
4. **Provider info**: Need to track which assistant created the session
5. **Reasoning**: Codex has explicit reasoning events with encrypted content
6. **Git integration**: Different approaches (simple branch vs. ghost commits)

## Unified Schema Design

### Core Principles

1. **Provider field everywhere**: Track which assistant created each record
2. **Common core + extensions**: Universal fields + provider-specific JSON blobs
3. **Event-based**: Support both message-based and event-based models
4. **Flexible tool tracking**: Handle different tool call representations

### Schema Tables

#### 1. Sessions Table (Enhanced)

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,  -- 'claude_code', 'codex_cli', 'cursor', etc.

  -- Common fields
  project_path TEXT,
  git_branch TEXT,

  -- Timing
  started_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Provider-specific metadata (JSON)
  provider_metadata TEXT,  -- JSON blob for provider-specific fields (git info, cli version, etc.)

  -- Additional metadata (common but optional)
  model_provider TEXT      -- e.g., 'anthropic', 'openai'
);

CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_provider ON sessions(provider);
CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_started ON sessions(started_at);
```

#### 2. Messages Table (Enhanced)

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,

  -- Message identity
  message_uuid TEXT UNIQUE NOT NULL,
  parent_uuid TEXT,

  -- Core message data
  role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
  content TEXT,

  -- Model info
  model TEXT,
  stop_reason TEXT,

  -- Message context
  is_sidechain INTEGER DEFAULT 0,  -- For Claude agents
  agent_id TEXT,

  -- Timing
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Token usage (common across providers)
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_creation_tokens INTEGER,
  reasoning_tokens INTEGER,  -- For OpenAI reasoning models

  -- Provider-specific data
  provider_metadata TEXT,  -- JSON blob for events, encrypted content, rate limits, etc.

  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_provider ON messages(provider);
CREATE INDEX idx_messages_uuid ON messages(message_uuid);
CREATE INDEX idx_messages_parent ON messages(parent_uuid);
CREATE INDEX idx_messages_agent ON messages(agent_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_role ON messages(role);
```

#### 3. Tool Calls Table (Enhanced)

```sql
CREATE TABLE tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,

  -- Tool call identity
  tool_use_id TEXT UNIQUE NOT NULL,
  agent_id TEXT,

  -- Tool data
  tool_name TEXT NOT NULL,
  tool_input TEXT,          -- JSON string
  tool_result TEXT,         -- JSON string or text
  is_error INTEGER DEFAULT 0,

  -- Performance
  duration_ms INTEGER,

  -- Timing
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Provider-specific
  provider_metadata TEXT,   -- JSON blob

  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX idx_tool_calls_agent ON tool_calls(agent_id);
CREATE INDEX idx_tool_calls_timestamp ON tool_calls(timestamp);
CREATE INDEX idx_tool_calls_provider ON tool_calls(provider);
```

#### 4. Agents Table (Enhanced)

```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,

  -- Agent context
  parent_message_uuid TEXT,
  subagent_type TEXT,       -- Claude-specific: 'Explore', 'Plan', etc.
  prompt TEXT,
  status TEXT,
  model TEXT,

  -- Performance metrics
  total_duration_ms INTEGER,
  total_tokens INTEGER,
  total_tool_calls INTEGER,

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Provider-specific
  provider_metadata TEXT,   -- JSON blob

  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX idx_agents_agent_id ON agents(agent_id);
CREATE INDEX idx_agents_session ON agents(session_id);
CREATE INDEX idx_agents_type ON agents(subagent_type);
CREATE INDEX idx_agents_provider ON agents(provider);
```

## Provider-Specific Metadata Examples

### Claude Code `provider_metadata`

Session level:
```json
{
  "permission_mode": "auto",
  "stop_hook_active": true,
  "has_trajectory_file": true
}
```

Message level:
```json
{
  "event_type": "user" | "assistant",
  "has_tool_uses": true
}
```

### Codex CLI `provider_metadata`

Session level:
```json
{
  "source": "cli",
  "originator": "codex_cli_rs",
  "cli_version": "0.63.0",
  "git_commit_hash": "...",
  "git_repository_url": "..."
}
```

Message level - stores events and other Codex-specific data:
```json
{
  "event_type": "event_msg",
  "event_subtype": "agent_reasoning",
  "has_encrypted_content": true,
  "encrypted_content": "...",
  "rate_limits": {
    "primary": { "used_percent": 0.0, "window_minutes": 300 },
    "secondary": { "used_percent": 0.0, "window_minutes": 10080 }
  },
  "turn_context": {
    "cwd": "/path",
    "approval_policy": "on-request",
    "sandbox_policy": { "type": "workspace-write" },
    "effort": "medium"
  },
  "ghost_snapshot": {
    "id": "...",
    "parent": "...",
    "preexisting_untracked_files": [],
    "preexisting_untracked_dirs": []
  }
}
```

## Migration Strategy

1. **Phase 1**: Add new fields to existing tables (backward compatible)
   - Add `provider` field (default: 'claude_code')
   - Add `provider_metadata` JSON fields
   - Add optional common fields (git_commit_hash, git_repository_url, etc.)

2. **Phase 2**: Refactor existing code
   - Extract Claude parser into adapter
   - Create adapter interface
   - Implement Codex adapter

## Adapter Interface

Each provider adapter should implement:

```typescript
interface ProviderAdapter {
  provider: string;  // 'claude_code', 'codex_cli', etc.

  // Detect if this adapter can handle the file
  canParse(content: string): boolean;

  // Parse the session file
  parse(content: string, filePath?: string): ParsedTranscript;
}

interface ParsedTranscript {
  session: SessionData;
  messages: MessageData[];
  toolCalls: ToolCallData[];
  agents: AgentData[];
  events?: EventData[];           // Optional: for event-based providers
  gitSnapshots?: GitSnapshotData[]; // Optional: for providers with git tracking
  turnContexts?: TurnContextData[]; // Optional: for turn-based providers
}
```

## Benefits of This Design

1. **Backward Compatible**: Existing Claude Code data works without migration
2. **Extensible**: Easy to add new providers via adapters
3. **Provider-Agnostic Queries**: Can query across all providers using common fields
4. **Provider-Specific Analysis**: Can drill into provider-specific metadata when needed
5. **Future-Proof**: JSON metadata fields allow adding new provider features without schema changes
6. **Simple**: Uses existing 4 tables (sessions, messages, tool_calls, agents) with JSON blobs for provider-specific features

## Next Steps

1. Implement migration to add new fields to existing tables
2. Create adapter interface and base types
3. Refactor Claude parser into Claude adapter
4. Implement Codex adapter
5. Add provider auto-detection logic
