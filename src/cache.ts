import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

interface GitRepoEntry {
  repo: string  // "owner/repo" format
  cached_at: string
}

interface CacheData {
  version: number
  git_repos: Record<string, GitRepoEntry>  // cwd -> entry
}

const CONFIG_DIR = join(homedir(), '.vibetracker')
const CACHE_PATH = join(CONFIG_DIR, 'cache.json')

export async function loadCache(): Promise<CacheData> {
  const file = Bun.file(CACHE_PATH)
  if (await file.exists()) {
    try {
      const data = await file.json()
      if (data.version === 1 && data.git_repos) {
        return data as CacheData
      }
    } catch {
      // Corrupt cache, return empty
    }
  }
  return { version: 1, git_repos: {} }
}

export async function saveCache(cache: CacheData): Promise<void> {
  mkdirSync(CONFIG_DIR, { recursive: true })
  await Bun.write(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n')
}

/**
 * Parse "owner/repo" from various GitHub URL formats:
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 * - git@github.com:owner/repo.git
 * - git@github.com:owner/repo
 */
export function parseGitRepoFromUrl(url: string): string | undefined {
  // Match github.com followed by : or /, then owner/repo, optionally ending in .git
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1]
}

/**
 * Look up the git repo for a given cwd.
 * Returns "owner/repo" format or null if not found.
 */
export async function getGitRepo(cwd: string): Promise<string | null> {
  // Check cache first
  const cache = await loadCache()
  const cached = cache.git_repos[cwd]
  if (cached?.repo) {
    return cached.repo
  }

  // Try gh repo view first (most reliable)
  let repo = await tryGhRepoView(cwd)

  // Fallback to git remote URL parsing
  if (!repo) {
    repo = await tryGitRemote(cwd)
  }

  // Cache result if found
  if (repo) {
    cache.git_repos[cwd] = {
      repo,
      cached_at: new Date().toISOString(),
    }
    await saveCache(cache)
  }

  return repo
}

async function tryGhRepoView(cwd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      cwd,
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const output = await new Response(proc.stdout).text()
    const repo = output.trim()
    return repo || null
  } catch {
    return null
  }
}

async function tryGitRemote(cwd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
      cwd,
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const output = await new Response(proc.stdout).text()
    const url = output.trim()
    if (url) {
      return parseGitRepoFromUrl(url) ?? null
    }
    return null
  } catch {
    return null
  }
}
