import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

const CODEX_CONFIG_PATH = join(homedir(), '.codex', 'config.toml')
const GEMINI_SETTINGS_PATH = join(homedir(), '.gemini', 'settings.json')
const CURSOR_HOOKS_PATH = join(homedir(), '.cursor', 'hooks.json')

export async function installCodex(): Promise<{ success: boolean; message: string }> {
  const configFile = Bun.file(CODEX_CONFIG_PATH)
  const notifyConfig = 'notify = ["bunx", "vibetracker", "ingest", "--source", "codex"]'

  if (await configFile.exists()) {
    const content = await configFile.text()

    // Check if notify is already configured
    if (content.includes('notify')) {
      // Check if it's already the vibetracker config
      if (content.includes('vibetracker')) {
        return { success: true, message: 'Vibetracker already configured in Codex' }
      }
      return {
        success: false,
        message: `Codex already has a notify configuration. Please manually update it to:\n\n${notifyConfig}`
      }
    }

    // Append notify configuration
    const newContent = content.trimEnd() + '\n\n' + notifyConfig + '\n'
    await Bun.write(CODEX_CONFIG_PATH, newContent)
    return { success: true, message: 'Added vibetracker to Codex config' }
  }

  // Create new config file
  mkdirSync(join(homedir(), '.codex'), { recursive: true })
  await Bun.write(CODEX_CONFIG_PATH, notifyConfig + '\n')
  return { success: true, message: 'Created Codex config with vibetracker' }
}

interface GeminiHook {
  type: string
  command: string
  name?: string
  timeout?: number
}

interface GeminiHookEntry {
  hooks: GeminiHook[]
}

interface GeminiSettings {
  hooks?: {
    AfterAgent?: GeminiHookEntry[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export async function installGemini(): Promise<{ success: boolean; message: string }> {
  const settingsFile = Bun.file(GEMINI_SETTINGS_PATH)

  const vibeTrackerHookEntry: GeminiHookEntry = {
    hooks: [
      {
        type: 'command',
        command: 'bunx vibetracker ingest --source gemini',
        name: 'vibetracker',
        timeout: 30000
      }
    ]
  }

  if (await settingsFile.exists()) {
    const content = await settingsFile.text()
    let settings: GeminiSettings

    try {
      settings = JSON.parse(content)
    } catch {
      return { success: false, message: 'Failed to parse Gemini settings.json' }
    }

    // Check if AfterAgent hook with vibetracker already exists
    if (settings.hooks?.AfterAgent) {
      const hasVibetracker = settings.hooks.AfterAgent.some(entry =>
        entry.hooks?.some(hook => hook.command?.includes('vibetracker'))
      )
      if (hasVibetracker) {
        return { success: true, message: 'Vibetracker already configured in Gemini' }
      }
    }

    // Add AfterAgent hook
    if (!settings.hooks) {
      settings.hooks = {}
    }
    if (!settings.hooks.AfterAgent) {
      settings.hooks.AfterAgent = []
    }
    settings.hooks.AfterAgent.push(vibeTrackerHookEntry)

    await Bun.write(GEMINI_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
    return { success: true, message: 'Added vibetracker to Gemini AfterAgent hooks' }
  }

  // Create new settings file
  mkdirSync(join(homedir(), '.gemini'), { recursive: true })
  const settings: GeminiSettings = {
    hooks: {
      AfterAgent: [vibeTrackerHookEntry]
    }
  }
  await Bun.write(GEMINI_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
  return { success: true, message: 'Created Gemini settings with vibetracker hooks' }
}

interface CursorHook {
  command: string
  timeout?: number
  failClosed?: boolean
}

interface CursorHooksConfig {
  version?: number
  hooks?: {
    stop?: CursorHook[]
    sessionEnd?: CursorHook[]
    [key: string]: CursorHook[] | undefined
  }
}

export async function installCursor(): Promise<{ success: boolean; message: string }> {
  const hooksFile = Bun.file(CURSOR_HOOKS_PATH)

  const vibeTrackerHook: CursorHook = {
    command: 'bunx vibetracker ingest --source cursor',
    timeout: 30000
  }

  if (await hooksFile.exists()) {
    const content = await hooksFile.text()
    let config: CursorHooksConfig

    try {
      config = JSON.parse(content)
    } catch {
      return { success: false, message: 'Failed to parse Cursor hooks.json' }
    }

    // Check if stop hook with vibetracker already exists
    if (config.hooks?.stop) {
      const hasVibetracker = config.hooks.stop.some(hook =>
        hook.command?.includes('vibetracker')
      )
      if (hasVibetracker) {
        return { success: true, message: 'Vibetracker already configured in Cursor' }
      }
    }

    // Add stop hook
    if (!config.hooks) {
      config.hooks = {}
    }
    if (!config.hooks.stop) {
      config.hooks.stop = []
    }
    config.hooks.stop.push(vibeTrackerHook)

    await Bun.write(CURSOR_HOOKS_PATH, JSON.stringify(config, null, 2) + '\n')
    return { success: true, message: 'Added vibetracker to Cursor stop hooks' }
  }

  // Create new hooks file
  mkdirSync(join(homedir(), '.cursor'), { recursive: true })
  const config: CursorHooksConfig = {
    version: 1,
    hooks: {
      stop: [vibeTrackerHook]
    }
  }
  await Bun.write(CURSOR_HOOKS_PATH, JSON.stringify(config, null, 2) + '\n')
  return { success: true, message: 'Created Cursor hooks.json with vibetracker' }
}

export async function installSource(source: string): Promise<{ success: boolean; message: string }> {
  switch (source) {
    case 'codex':
      return installCodex()
    case 'gemini':
      return installGemini()
    case 'cursor':
      return installCursor()
    default:
      return { success: false, message: `Install not supported for source: ${source}. Use "codex", "gemini", or "cursor".` }
  }
}
