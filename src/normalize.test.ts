import { test, expect, describe } from 'bun:test'
import { normalizeToolName as normalizeClaudeToolName } from './ingest/claude'
import { normalizeToolName as normalizeCodexToolName } from './ingest/codex'
import { normalizeToolName as normalizeGeminiToolName } from './ingest/gemini'

describe('normalizeToolName', () => {
  describe('claude', () => {
    test('normalizes Bash to bash', () => {
      expect(normalizeClaudeToolName('Bash')).toBe('bash')
    })

    test('normalizes Read to file_read', () => {
      expect(normalizeClaudeToolName('Read')).toBe('file_read')
    })

    test('normalizes Write to file_write', () => {
      expect(normalizeClaudeToolName('Write')).toBe('file_write')
    })

    test('normalizes Edit to file_edit', () => {
      expect(normalizeClaudeToolName('Edit')).toBe('file_edit')
    })

    test('normalizes MultiEdit to file_edit', () => {
      expect(normalizeClaudeToolName('MultiEdit')).toBe('file_edit')
    })

    test('normalizes Grep to grep', () => {
      expect(normalizeClaudeToolName('Grep')).toBe('grep')
    })

    test('normalizes Glob to glob', () => {
      expect(normalizeClaudeToolName('Glob')).toBe('glob')
    })

    test('normalizes ListDir to list_dir', () => {
      expect(normalizeClaudeToolName('ListDir')).toBe('list_dir')
    })

    test('normalizes WebFetch to web_fetch', () => {
      expect(normalizeClaudeToolName('WebFetch')).toBe('web_fetch')
    })

    test('normalizes WebSearch to web_search', () => {
      expect(normalizeClaudeToolName('WebSearch')).toBe('web_search')
    })

    test('normalizes Task to task', () => {
      expect(normalizeClaudeToolName('Task')).toBe('task')
    })

    test('returns other for unknown tool names', () => {
      expect(normalizeClaudeToolName('UnknownTool')).toBe('other')
      expect(normalizeClaudeToolName('FooBar')).toBe('other')
      expect(normalizeClaudeToolName('')).toBe('other')
    })
  })

  describe('codex', () => {
    test('normalizes known tool names', () => {
      expect(normalizeCodexToolName('shell_command')).toBe('bash')
      expect(normalizeCodexToolName('read_file')).toBe('file_read')
      expect(normalizeCodexToolName('write_file')).toBe('file_write')
      expect(normalizeCodexToolName('patch_file')).toBe('file_edit')
      expect(normalizeCodexToolName('delete_file')).toBe('file_delete')
      expect(normalizeCodexToolName('grep')).toBe('grep')
      expect(normalizeCodexToolName('glob')).toBe('glob')
      expect(normalizeCodexToolName('list_dir')).toBe('list_dir')
      expect(normalizeCodexToolName('web_fetch')).toBe('web_fetch')
      expect(normalizeCodexToolName('web_search')).toBe('web_search')
    })

    test('returns other for unknown tool names', () => {
      expect(normalizeCodexToolName('Bash')).toBe('other')
      expect(normalizeCodexToolName('UnknownTool')).toBe('other')
    })
  })

  describe('gemini', () => {
    test('normalizes known tool names', () => {
      expect(normalizeGeminiToolName('run_shell_command')).toBe('bash')
      expect(normalizeGeminiToolName('read_file')).toBe('file_read')
      expect(normalizeGeminiToolName('write_file')).toBe('file_write')
      expect(normalizeGeminiToolName('replace')).toBe('file_edit')
      expect(normalizeGeminiToolName('search_file_content')).toBe('grep')
      expect(normalizeGeminiToolName('glob')).toBe('glob')
      expect(normalizeGeminiToolName('list_directory')).toBe('list_dir')
      expect(normalizeGeminiToolName('web_fetch')).toBe('web_fetch')
      expect(normalizeGeminiToolName('google_web_search')).toBe('web_search')
      expect(normalizeGeminiToolName('delegate_to_agent')).toBe('task')
    })

    test('returns other for unknown tool names', () => {
      expect(normalizeGeminiToolName('Bash')).toBe('other')
      expect(normalizeGeminiToolName('UnknownTool')).toBe('other')
    })
  })
})

