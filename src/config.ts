import { homedir } from 'os'
import { join } from 'path'

export interface Config {
  user_id: string
  team_id?: string
  machine_id?: string
  storage?: {
    provider: 's3' | 'gcs' | 'abs' | 'r2'
    bucket: string
    region?: string
  }
}

const CONFIG_DIR = join(homedir(), '.vibe-tracker')
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

  // Default config - use git user.name or hostname
  const gitUser = await getGitUserName()
  const hostname = (await import('os')).hostname()

  return {
    user_id: gitUser || hostname,
    machine_id: hostname,
  }
}

async function getGitUserName(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', 'config', 'user.name'], {
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const output = await new Response(proc.stdout).text()
    return output.trim() || null
  } catch {
    return null
  }
}
