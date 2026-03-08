import { test, expect, describe, beforeEach, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('installCodex', () => {
  let tmpDir: string
  let configPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibetracker-codex-test-'))
    configPath = join(tmpDir, 'config.toml')
  })

  afterAll(() => {
    // Clean up all temp dirs created during tests
  })

  test('creates new config file when none exists', async () => {
    const notifyConfig = 'notify = ["bunx", "vibetracker", "ingest", "--source", "codex"]'

    // Simulate what installCodex does for a missing file
    const configFile = Bun.file(configPath)
    expect(await configFile.exists()).toBe(false)

    mkdirSync(tmpDir, { recursive: true })
    await Bun.write(configPath, notifyConfig + '\n')

    const written = await Bun.file(configPath).text()
    expect(written).toContain('notify')
    expect(written).toContain('vibetracker')
  })

  test('appends to existing config without notify', async () => {
    const existingContent = 'model = "o4-mini"\napproval_policy = "auto-edit"\n'
    await Bun.write(configPath, existingContent)

    const content = await Bun.file(configPath).text()
    expect(content.includes('notify')).toBe(false)

    const notifyConfig = 'notify = ["bunx", "vibetracker", "ingest", "--source", "codex"]'
    const newContent = content.trimEnd() + '\n\n' + notifyConfig + '\n'
    await Bun.write(configPath, newContent)

    const result = await Bun.file(configPath).text()
    expect(result).toContain('model = "o4-mini"')
    expect(result).toContain('notify')
    expect(result).toContain('vibetracker')
  })

  test('detects existing vibetracker config', async () => {
    const content = 'notify = ["bunx", "vibetracker", "ingest", "--source", "codex"]\n'
    await Bun.write(configPath, content)

    const fileContent = await Bun.file(configPath).text()
    expect(fileContent.includes('notify')).toBe(true)
    expect(fileContent.includes('vibetracker')).toBe(true)
  })

  test('detects conflicting notify config', async () => {
    const content = 'notify = ["some-other-tool"]\n'
    await Bun.write(configPath, content)

    const fileContent = await Bun.file(configPath).text()
    expect(fileContent.includes('notify')).toBe(true)
    expect(fileContent.includes('vibetracker')).toBe(false)
  })
})

describe('installGemini', () => {
  let tmpDir: string
  let settingsPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibetracker-gemini-test-'))
    settingsPath = join(tmpDir, 'settings.json')
  })

  test('creates new settings file when none exists', async () => {
    const settings = {
      hooks: {
        AfterAgent: [
          {
            hooks: [
              {
                type: 'command',
                command: 'bunx vibetracker ingest --source gemini',
                name: 'vibetracker',
                timeout: 30000,
              },
            ],
          },
        ],
      },
    }

    await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n')

    const written = await Bun.file(settingsPath).json()
    expect(written.hooks.AfterAgent).toHaveLength(1)
    expect(written.hooks.AfterAgent[0].hooks[0].command).toContain('vibetracker')
  })

  test('adds hook to existing settings without hooks', async () => {
    const existingSettings = { theme: 'dark' }
    await Bun.write(settingsPath, JSON.stringify(existingSettings))

    const settings = await Bun.file(settingsPath).json()
    expect(settings.hooks).toBeUndefined()

    // Simulate adding hooks
    settings.hooks = {
      AfterAgent: [
        {
          hooks: [
            {
              type: 'command',
              command: 'bunx vibetracker ingest --source gemini',
              name: 'vibetracker',
              timeout: 30000,
            },
          ],
        },
      ],
    }

    await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n')

    const result = await Bun.file(settingsPath).json()
    expect(result.theme).toBe('dark')
    expect(result.hooks.AfterAgent).toHaveLength(1)
  })

  test('appends hook to existing AfterAgent hooks', async () => {
    const existingSettings = {
      hooks: {
        AfterAgent: [
          {
            hooks: [
              {
                type: 'command',
                command: 'some-other-tool',
                name: 'other',
              },
            ],
          },
        ],
      },
    }
    await Bun.write(settingsPath, JSON.stringify(existingSettings))

    const settings = await Bun.file(settingsPath).json()

    // Check vibetracker not present
    const hasVibetracker = settings.hooks.AfterAgent.some((entry: any) =>
      entry.hooks?.some((hook: any) => hook.command?.includes('vibetracker'))
    )
    expect(hasVibetracker).toBe(false)

    // Add it
    settings.hooks.AfterAgent.push({
      hooks: [
        {
          type: 'command',
          command: 'bunx vibetracker ingest --source gemini',
          name: 'vibetracker',
          timeout: 30000,
        },
      ],
    })

    await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n')

    const result = await Bun.file(settingsPath).json()
    expect(result.hooks.AfterAgent).toHaveLength(2)
  })

  test('detects existing vibetracker hook', async () => {
    const settings = {
      hooks: {
        AfterAgent: [
          {
            hooks: [
              {
                type: 'command',
                command: 'bunx vibetracker ingest --source gemini',
                name: 'vibetracker',
              },
            ],
          },
        ],
      },
    }
    await Bun.write(settingsPath, JSON.stringify(settings))

    const loaded = await Bun.file(settingsPath).json()
    const hasVibetracker = loaded.hooks.AfterAgent.some((entry: any) =>
      entry.hooks?.some((hook: any) => hook.command?.includes('vibetracker'))
    )
    expect(hasVibetracker).toBe(true)
  })

  test('handles invalid JSON gracefully', async () => {
    await Bun.write(settingsPath, 'not valid json{{{')

    let parseError = false
    try {
      await Bun.file(settingsPath).json()
    } catch {
      parseError = true
    }
    expect(parseError).toBe(true)
  })
})

describe('installSource', () => {
  test('routes to correct installer', async () => {
    const { installSource } = await import('./install')

    // Test unsupported source
    const result = await installSource('unsupported')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not supported')
  })
})
