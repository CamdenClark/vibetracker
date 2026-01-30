import { test, expect, describe } from 'bun:test'
import { parseGitRepoFromUrl } from './cache'

describe('parseGitRepoFromUrl', () => {
  test('parses HTTPS URL with .git extension', () => {
    const url = 'https://github.com/camdenclark/vibetracker.git'
    expect(parseGitRepoFromUrl(url)).toBe('camdenclark/vibetracker')
  })

  test('parses HTTPS URL without .git extension', () => {
    const url = 'https://github.com/camdenclark/vibetracker'
    expect(parseGitRepoFromUrl(url)).toBe('camdenclark/vibetracker')
  })

  test('parses SSH URL with .git extension', () => {
    const url = 'git@github.com:camdenclark/vibetracker.git'
    expect(parseGitRepoFromUrl(url)).toBe('camdenclark/vibetracker')
  })

  test('parses SSH URL without .git extension', () => {
    const url = 'git@github.com:camdenclark/vibetracker'
    expect(parseGitRepoFromUrl(url)).toBe('camdenclark/vibetracker')
  })

  test('handles repo with hyphen in name', () => {
    const url = 'https://github.com/owner-name/repo-name.git'
    expect(parseGitRepoFromUrl(url)).toBe('owner-name/repo-name')
  })

  test('handles repo with underscore in name', () => {
    const url = 'https://github.com/owner_name/repo_name.git'
    expect(parseGitRepoFromUrl(url)).toBe('owner_name/repo_name')
  })

  test('returns undefined for non-GitHub URL', () => {
    const url = 'https://gitlab.com/owner/repo.git'
    expect(parseGitRepoFromUrl(url)).toBeUndefined()
  })

  test('returns undefined for invalid URL', () => {
    const url = 'not-a-url'
    expect(parseGitRepoFromUrl(url)).toBeUndefined()
  })
})
