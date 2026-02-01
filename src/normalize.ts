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

// Cursor uses a mix of Claude-style and custom tool names
const CURSOR_TOOL_MAP: Record<string, ToolName> = {
  // Claude-style names
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
  // Cursor-specific names
  read_file: 'file_read',
  write_file: 'file_write',
  edit_file: 'file_edit',
  run_terminal_command: 'bash',
  terminal: 'bash',
  search_files: 'grep',
  list_directory: 'list_dir',
  codebase_search: 'grep',
  file_search: 'glob',
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
  if (source === 'cursor') {
    return CURSOR_TOOL_MAP[rawName] ?? 'other'
  }
  return 'other'
}
