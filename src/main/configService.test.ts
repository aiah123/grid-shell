import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateLegacyConfig } from './configService'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'gs-migrate-'))

describe('migrateLegacyConfig', () => {
  it('copies settings, saved sessions and themes, but not Electron caches', () => {
    const from = tmp()
    const to = path.join(tmp(), 'grid-shell')
    writeFileSync(path.join(from, 'config.toml'), 'theme = "Nord"\n')
    writeFileSync(path.join(from, 'state.json'), '{}')
    mkdirSync(path.join(from, 'themes'))
    writeFileSync(path.join(from, 'themes', 'Mine.json'), '{}')
    mkdirSync(path.join(from, 'GPUCache'))
    expect(migrateLegacyConfig(from, to)).toEqual(['config.toml', 'state.json', 'themes'])
    expect(readFileSync(path.join(to, 'config.toml'), 'utf8')).toBe('theme = "Nord"\n')
    expect(existsSync(path.join(to, 'themes', 'Mine.json'))).toBe(true)
    expect(existsSync(path.join(to, 'GPUCache'))).toBe(false)
    expect(existsSync(path.join(from, 'config.toml'))).toBe(true) // old folder left alone
  })

  it('does nothing when the new folder already has settings, or there is no old folder', () => {
    const from = tmp()
    const to = tmp()
    writeFileSync(path.join(from, 'config.toml'), 'old')
    writeFileSync(path.join(to, 'config.toml'), 'new')
    expect(migrateLegacyConfig(from, to)).toEqual([])
    expect(readFileSync(path.join(to, 'config.toml'), 'utf8')).toBe('new')
    expect(migrateLegacyConfig(path.join(from, 'missing'), tmp())).toEqual([])
    expect(migrateLegacyConfig(null, tmp())).toEqual([])
  })
})
