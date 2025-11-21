# Vibetracker Database Schema Design

## Goals
- Track user prompts and assistant responses
- Enable analytics on individual tool calls
- Capture complete agent trajectories
- Support querying by session, time, tool type, etc.

## Proposed Schema

### sessions
Tracks high-level conversation sessions
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  project_path TEXT,
  git_branch TEXT,
  started_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
```

### messages
Individual messages in the conversation (user + assistant)
```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_uuid TEXT UNIQUE NOT NULL,
  parent_uuid TEXT,
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT,  -- Full message content (may include tool_use blocks)
  model TEXT,  -- claude model used (if assistant)
  stop_reason TEXT,  -- end_turn, tool_use, etc.
  is_sidechain BOOLEAN DEFAULT 0,  -- true for agent messages
  agent_id TEXT,  -- if this is an agent message
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Token usage (if assistant message)
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_creation_tokens INTEGER,

  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_uuid ON messages(message_uuid);
CREATE INDEX idx_messages_parent ON messages(parent_uuid);
CREATE INDEX idx_messages_agent ON messages(agent_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

### tool_calls
Individual tool invocations (for analytics)
```sql
CREATE TABLE tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT,  -- if this tool was called by an agent
  tool_use_id TEXT UNIQUE NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input TEXT,  -- JSON of input params
  tool_result TEXT,  -- Result content
  is_error BOOLEAN DEFAULT 0,
  duration_ms INTEGER,  -- if available
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX idx_tool_calls_agent ON tool_calls(agent_id);
CREATE INDEX idx_tool_calls_timestamp ON tool_calls(timestamp);
```

### agents
Agent execution metadata (one row per agent)
```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  parent_message_uuid TEXT,  -- message that triggered this agent
  subagent_type TEXT,  -- Explore, Plan, etc.
  prompt TEXT,  -- The task prompt given to agent
  status TEXT,  -- completed, error, etc.
  model TEXT,  -- haiku, sonnet, etc.

  -- Aggregate metrics
  total_duration_ms INTEGER,
  total_tokens INTEGER,
  total_tool_calls INTEGER,

  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
CREATE INDEX idx_agents_agent_id ON agents(agent_id);
CREATE INDEX idx_agents_session ON agents(session_id);
CREATE INDEX idx_agents_type ON agents(subagent_type);
```

## Data Flow

### On SubagentStop Event
1. Parse the session transcript to find the Task tool call
2. Extract agent metadata (agentId, prompt, type, model)
3. Insert/update `agents` table
4. Load agent trajectory file (`agent-{agentId}.jsonl`)
5. Parse each message in agent trajectory
6. Insert agent messages into `messages` (with `is_sidechain=1, agent_id={agentId}`)
7. Extract and insert tool calls from agent into `tool_calls`

### On Stop Event
1. Parse full session transcript
2. Insert/update `sessions` table
3. Parse each message
4. Insert user/assistant messages into `messages`
5. Extract tool calls and insert into `tool_calls`
6. Link to any agents that were triggered

## Query Examples

### Get all tool calls for a session
```sql
SELECT * FROM tool_calls WHERE session_id = ?
```

### Analytics: Most used tools
```sql
SELECT tool_name, COUNT(*) as count, AVG(duration_ms) as avg_duration
FROM tool_calls
GROUP BY tool_name
ORDER BY count DESC
```

### Get agent execution for a specific agent
```sql
SELECT m.*, t.tool_name, t.tool_result
FROM messages m
LEFT JOIN tool_calls t ON t.message_id = m.id
WHERE m.agent_id = ?
ORDER BY m.timestamp
```

### Get full conversation tree (with agents)
```sql
WITH RECURSIVE conversation_tree AS (
  -- Start with root message
  SELECT * FROM messages WHERE parent_uuid IS NULL AND session_id = ?

  UNION ALL

  -- Recursively get children
  SELECT m.* FROM messages m
  INNER JOIN conversation_tree ct ON m.parent_uuid = ct.message_uuid
)
SELECT * FROM conversation_tree ORDER BY timestamp
```

### Get all sessions with agent usage
```sql
SELECT s.session_id, COUNT(DISTINCT a.agent_id) as agent_count, SUM(a.total_tokens) as total_agent_tokens
FROM sessions s
LEFT JOIN agents a ON a.session_id = s.session_id
GROUP BY s.session_id
```

## Advantages of This Schema

1. **Normalized**: Reduces duplication, sessions/agents/messages/tools are separate
2. **Analytics-friendly**: Easy to query tool usage, token costs, agent performance
3. **Relationship preserved**: parent_uuid links maintain conversation tree
4. **Agent transparency**: Agent messages and tools are linked to parent session
5. **Flexible queries**: Can view at session, message, or tool-call granularity
6. **Scalable**: Indexes support fast queries even with many sessions

## Migration Path

Since you already have a `transcripts` table, we can:
1. Create new tables
2. Write migration script to parse existing transcripts
3. Populate new schema
4. Keep old table for backup/reference
