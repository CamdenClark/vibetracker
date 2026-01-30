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

const CODEX_TOOL_MAP: Record<string, ToolName> = {
  shell_command: 'bash',
  read_file: 'file_read',
  write_file: 'file_write',
  patch_file: 'file_edit',
  delete_file: 'file_delete',
  grep: 'grep',
  glob: 'glob',
  list_dir: 'list_dir',
  web_fetch: 'web_fetch',
  web_search: 'web_search',
}

const GEMINI_TOOL_MAP: Record<string, ToolName> = {
  run_shell_command: 'bash',
  read_file: 'file_read',
  write_file: 'file_write',
  replace: 'file_edit',
  search_file_content: 'grep',
  glob: 'glob',
  list_directory: 'list_dir',
  web_fetch: 'web_fetch',
  google_web_search: 'web_search',
  delegate_to_agent: 'task',
}

export function normalizeToolName(rawName: string, source: string): ToolName {
  if (source === 'claude_code') {
    return CLAUDE_TOOL_MAP[rawName] ?? 'other'
  }
  if (source === 'codex') {
    return CODEX_TOOL_MAP[rawName] ?? 'other'
  }
  if (source === 'gemini') {
    return GEMINI_TOOL_MAP[rawName] ?? 'other'
  }
  return 'other'
}
