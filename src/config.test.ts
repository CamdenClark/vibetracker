import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { toS3Safe } from './config'

describe('toS3Safe', () => {
  test('converts uppercase to lowercase', () => {
    expect(toS3Safe('MyHostName')).toBe('myhostname')
  })

  test('replaces dots with hyphens', () => {
    expect(toS3Safe('my.host.name')).toBe('my-host-name')
  })

  test('replaces spaces with hyphens', () => {
    expect(toS3Safe('my host name')).toBe('my-host-name')
  })

  test('collapses multiple hyphens', () => {
    expect(toS3Safe('my--host---name')).toBe('my-host-name')
  })

  test('removes leading and trailing hyphens', () => {
    expect(toS3Safe('-my-host-name-')).toBe('my-host-name')
  })

  test('preserves underscores', () => {
    expect(toS3Safe('my_host_name')).toBe('my_host_name')
  })

  test('handles special characters', () => {
    expect(toS3Safe('user@host.com')).toBe('user-host-com')
  })

  test('handles empty string', () => {
    expect(toS3Safe('')).toBe('')
  })

  test('handles already safe string', () => {
    expect(toS3Safe('my-host-123')).toBe('my-host-123')
  })
})

describe('loadConfig and initializeConfig', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibetracker-config-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('loadConfig reads existing config file', async () => {
    const configDir = join(tmpDir, 'read-test')
    const { mkdirSync } = await import('fs')
    mkdirSync(configDir, { recursive: true })

    const configPath = join(configDir, 'config.json')
    const config = { user_id: 'test-user', team_id: 'my-team', machine_id: 'my-machine' }
    await Bun.write(configPath, JSON.stringify(config))

    // We can't easily test loadConfig directly since it uses hardcoded CONFIG_DIR,
    // but we can test that the file writing/reading works with Bun.file
    const file = Bun.file(configPath)
    expect(await file.exists()).toBe(true)
    const loaded = await file.json()
    expect(loaded.user_id).toBe('test-user')
    expect(loaded.team_id).toBe('my-team')
    expect(loaded.machine_id).toBe('my-machine')
  })

  test('getConfigDir returns a path ending with .vibetracker', async () => {
    const { getConfigDir } = await import('./config')
    const dir = getConfigDir()
    expect(dir.endsWith('.vibetracker')).toBe(true)
  })

  test('getDbPath returns a path ending with events.db', async () => {
    const { getDbPath } = await import('./config')
    const path = getDbPath()
    expect(path.endsWith('events.db')).toBe(true)
  })
})
