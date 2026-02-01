import { test, expect, describe } from 'bun:test'
import { normalizeToolName } from './normalize'

describe('normalizeToolName', () => {
  describe('claude_code source', () => {
    test('normalizes Bash to bash', () => {
      expect(normalizeToolName('Bash', 'claude_code')).toBe('bash')
    })

    test('normalizes Read to file_read', () => {
      expect(normalizeToolName('Read', 'claude_code')).toBe('file_read')
    })

    test('normalizes Write to file_write', () => {
      expect(normalizeToolName('Write', 'claude_code')).toBe('file_write')
    })

    test('normalizes Edit to file_edit', () => {
      expect(normalizeToolName('Edit', 'claude_code')).toBe('file_edit')
    })

    test('normalizes MultiEdit to file_edit', () => {
      expect(normalizeToolName('MultiEdit', 'claude_code')).toBe('file_edit')
    })

    test('normalizes Grep to grep', () => {
      expect(normalizeToolName('Grep', 'claude_code')).toBe('grep')
    })

    test('normalizes Glob to glob', () => {
      expect(normalizeToolName('Glob', 'claude_code')).toBe('glob')
    })

    test('normalizes ListDir to list_dir', () => {
      expect(normalizeToolName('ListDir', 'claude_code')).toBe('list_dir')
    })

    test('normalizes WebFetch to web_fetch', () => {
      expect(normalizeToolName('WebFetch', 'claude_code')).toBe('web_fetch')
    })

    test('normalizes WebSearch to web_search', () => {
      expect(normalizeToolName('WebSearch', 'claude_code')).toBe('web_search')
    })

    test('normalizes Task to task', () => {
      expect(normalizeToolName('Task', 'claude_code')).toBe('task')
    })

    test('returns other for unknown tool names', () => {
      expect(normalizeToolName('UnknownTool', 'claude_code')).toBe('other')
      expect(normalizeToolName('FooBar', 'claude_code')).toBe('other')
      expect(normalizeToolName('', 'claude_code')).toBe('other')
    })
  })

  describe('cursor source', () => {
    test('normalizes Claude-style names', () => {
      expect(normalizeToolName('Bash', 'cursor')).toBe('bash')
      expect(normalizeToolName('Read', 'cursor')).toBe('file_read')
      expect(normalizeToolName('Write', 'cursor')).toBe('file_write')
      expect(normalizeToolName('Edit', 'cursor')).toBe('file_edit')
    })

    test('normalizes Cursor-specific names', () => {
      expect(normalizeToolName('read_file', 'cursor')).toBe('file_read')
      expect(normalizeToolName('write_file', 'cursor')).toBe('file_write')
      expect(normalizeToolName('run_terminal_command', 'cursor')).toBe('bash')
      expect(normalizeToolName('codebase_search', 'cursor')).toBe('grep')
    })

    test('returns other for unknown tool names', () => {
      expect(normalizeToolName('UnknownTool', 'cursor')).toBe('other')
    })
  })

  describe('other sources', () => {
    test('returns other for unsupported sources', () => {
      expect(normalizeToolName('Bash', 'codex')).toBe('other')
      expect(normalizeToolName('Write', 'opencode')).toBe('other')
      expect(normalizeToolName('Anything', 'other')).toBe('other')
    })
  })
})
