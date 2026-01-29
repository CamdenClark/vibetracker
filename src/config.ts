import { homedir, hostname } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

export interface Config {
  user_id: string
  team_id?: string
  machine_id?: string
}

const CONFIG_DIR = join(homedir(), '.vibetracker')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function getDbPath(): string {
  return join(CONFIG_DIR, 'events.db')
}

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_PATH)
  if (await file.exists()) {
    return await file.json()
  }

  // Auto-initialize config on first load
  const config = await initializeConfig()
  return config
}

export async function initializeConfig(): Promise<Config> {
  const userId = await resolveUserId()
  const config: Config = {
    user_id: userId,
    machine_id: toS3Safe(hostname()),
  }

  // Save config
  mkdirSync(CONFIG_DIR, { recursive: true })
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  return config
}

async function resolveUserId(): Promise<string> {
  // Try GitHub CLI first
  const ghUsername = await getGitHubUsername()
  if (ghUsername) return ghUsername

  // Fall back to git email
  const gitEmail = await getGitEmail()
  if (gitEmail) return gitEmail

  // Final fallback: S3-safe hostname
  return toS3Safe(hostname())
}

async function getGitHubUsername(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['gh', 'api', 'user', '--jq', '.login'], {
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const output = await new Response(proc.stdout).text()
    const username = output.trim()
    return username || null
  } catch {
    return null
  }
}

async function getGitEmail(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', 'config', 'user.email'], {
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const output = await new Response(proc.stdout).text()
    return output.trim() || null
  } catch {
    return null
  }
}

function toS3Safe(name: string): string {
  // S3 keys: lowercase alphanumeric, hyphens, underscores
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
