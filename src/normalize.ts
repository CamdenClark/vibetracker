import type { ToolName } from './schema'

const CLAUDE_TOOL_MAP: Record<string, ToolName> = {
  Bash: 'bash',
  Read: 'file_read',
  Write: 'file_write',
  Edit: 'file_edit',
  MultiEdit: 'file_edit',
  Grep: 'grep',
  Glob: 'glob',
  ListDir: 'list_dir',
  WebFetch: 'web_fetch',
  WebSearch: 'web_search',
  Task: 'task',
}

export function normalizeToolName(rawName: string, source: string): ToolName {
  if (source === 'claude_code') {
    return CLAUDE_TOOL_MAP[rawName] ?? 'other'
  }
  return 'other'
}
