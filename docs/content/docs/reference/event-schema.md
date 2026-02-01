---
title: "Event Schema"
weight: 1
---

# Event Schema

Every event in Vibetracker follows the `VibeEvent` schema. This page documents all available fields.

## Core Fields

These fields are present on every event.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (UUIDv7) for the event |
| `timestamp` | `string` | ISO 8601 timestamp when the event occurred |
| `user_id` | `string` | User identifier from configuration |
| `session_id` | `string` | Unique identifier for the coding session |
| `event_type` | `EventType` | Type of event (see below) |
| `source` | `AgentSource` | Which agent generated this event |

### Optional Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `team_id` | `string` | Team identifier (if configured) |
| `machine_id` | `string` | Machine identifier (if configured) |

## Event Types

The `event_type` field indicates what kind of event occurred:

| Value | Description |
|-------|-------------|
| `session_start` | A new coding session began |
| `session_end` | A coding session completed |
| `prompt` | User submitted a prompt to the agent |
| `turn_start` | Agent began processing a turn |
| `turn_end` | Agent completed a turn |
| `tool_call` | Agent invoked a tool |
| `error` | An error occurred |

## Agent Sources

The `source` field identifies which agentic coding tool generated the event:

| Value | Description |
|-------|-------------|
| `claude_code` | Anthropic's Claude Code CLI |
| `codex` | OpenAI Codex |
| `gemini` | Google Gemini CLI |
| `opencode` | OpenCode |
| `cursor` | Cursor editor |
| `other` | Other/unknown source |

## Session Context Fields

These fields provide context about the coding session.

| Field | Type | Description |
|-------|------|-------------|
| `session_cwd` | `string` | Working directory when session started |
| `session_git_repo` | `string` | Git repository URL or name |
| `session_git_branch` | `string` | Git branch name |
| `session_duration_ms` | `number` | Total session duration in milliseconds (on `session_end`) |

## Turn and Token Fields

These fields track AI model usage per turn.

| Field | Type | Description |
|-------|------|-------------|
| `turn_index` | `number` | Sequential index of the turn within the session (0-based) |
| `prompt_tokens` | `number` | Number of tokens in the prompt |
| `completion_tokens` | `number` | Number of tokens in the completion |
| `total_tokens` | `number` | Total tokens used (prompt + completion) |
| `model` | `string` | Model identifier (e.g., `claude-sonnet-4-20250514`) |

## Tool Execution Fields

These fields are populated on `tool_call` events.

| Field | Type | Description |
|-------|------|-------------|
| `tool_name` | `ToolName` | Normalized tool name (see below) |
| `tool_name_raw` | `string` | Original tool name from the agent |
| `tool_input` | `string` | Input/arguments passed to the tool |
| `tool_output` | `string` | Output returned by the tool |
| `tool_duration_ms` | `number` | Time to execute the tool in milliseconds |
| `tool_success` | `boolean` | Whether the tool execution succeeded |

### Tool Names

The `tool_name` field is normalized across agent sources:

| Value | Description |
|-------|-------------|
| `bash` | Shell command execution |
| `file_read` | Reading file contents |
| `file_write` | Writing/creating files |
| `file_edit` | Editing existing files |
| `file_delete` | Deleting files |
| `grep` | Searching file contents |
| `glob` | Finding files by pattern |
| `list_dir` | Listing directory contents |
| `web_fetch` | Fetching web content |
| `web_search` | Web search queries |
| `task` | Spawning subagent tasks |
| `mcp_tool` | Model Context Protocol tool |
| `other` | Other/unknown tool |

## MCP Server Fields

These fields are populated when an MCP (Model Context Protocol) tool is invoked.

| Field | Type | Description |
|-------|------|-------------|
| `mcp_server` | `string` | Name of the MCP server |
| `mcp_tool_name` | `string` | Name of the tool on the MCP server |

## File Operation Fields

These fields provide details about file operations.

| Field | Type | Description |
|-------|------|-------------|
| `file_path` | `string` | Path to the file being operated on |
| `file_action` | `string` | Action type: `create`, `update`, or `delete` |
| `file_lines_added` | `number` | Number of lines added |
| `file_lines_removed` | `number` | Number of lines removed |

## Error Fields

These fields are populated on `error` events.

| Field | Type | Description |
|-------|------|-------------|
| `error_message` | `string` | Human-readable error message |
| `error_code` | `string` | Error code or classification |

## Prompt Fields

| Field | Type | Description |
|-------|------|-------------|
| `prompt_text` | `string` | The user's prompt text (on `prompt` events) |

## Subagent Fields

These fields track subagent/task spawning.

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | `string` | Unique identifier for the subagent |
| `agent_type` | `string` | Type of subagent (e.g., `Explore`, `Bash`) |

## Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `meta` | `object` | Arbitrary JSON metadata |
| `synced_at` | `string` | Timestamp when event was synced to remote (if applicable) |
