import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig, findConfigFile, resolveDatabasePath, createDefaultConfig } from './config.js'

describe('Config', () => {
  let testDir: string

  beforeAll(() => {
    testDir = join(tmpdir(), `aw-config-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('loadConfig', () => {
    it('returns default config when no file exists', () => {
      const config = loadConfig()
      expect(config.session).toBe('default')
      expect(config.daemon?.autoStart).toBe(true)
    })

    it('loads config from .awrc file', () => {
      const configPath = join(testDir, '.awrc')
      writeFileSync(configPath, JSON.stringify({
        session: 'test-session',
        daemon: { port: 8080 }
      }))
      
      const config = loadConfig(configPath)
      expect(config.session).toBe('test-session')
      expect(config.daemon?.port).toBe(8080)
    })

    it('merges with defaults', () => {
      const configPath = join(testDir, '.awrc2')
      writeFileSync(configPath, JSON.stringify({
        session: 'custom'
      }))
      
      const config = loadConfig(configPath)
      expect(config.session).toBe('custom')
      expect(config.daemon?.autoStart).toBe(true)
      expect(config.database?.path).toBe('.agents/workstation.db')
    })

    it('handles invalid JSON gracefully', () => {
      const configPath = join(testDir, '.awrc3')
      writeFileSync(configPath, 'not valid json')
      
      const config = loadConfig(configPath)
      expect(config.session).toBe('default')
    })
  })

  describe('findConfigFile', () => {
    it('returns null when no config file exists', () => {
      // Use a unique temp directory that won't have any config files
      const emptyDir = join(tmpdir(), `aw-empty-${Date.now()}`)
      mkdirSync(emptyDir, { recursive: true })
      
      const result = findConfigFile(emptyDir)
      
      // Clean up
      rmSync(emptyDir, { recursive: true, force: true })
      
      expect(result).toBeNull()
    })

    it('finds .awrc in current directory', () => {
      const awrcDir = join(testDir, 'awrc-test')
      mkdirSync(awrcDir, { recursive: true })
      const configPath = join(awrcDir, '.awrc')
      writeFileSync(configPath, '{}')
      
      const result = findConfigFile(awrcDir)
      expect(result).toBe(configPath)
    })

    it('finds aw.config.json', () => {
      const jsonDir = join(testDir, 'json-test')
      const subDir = join(jsonDir, 'subdir')
      mkdirSync(subDir, { recursive: true })
      const configPath = join(jsonDir, 'aw.config.json')
      writeFileSync(configPath, '{}')
      
      const result = findConfigFile(subDir)
      expect(result).toBe(configPath)
    })
  })

  describe('resolveDatabasePath', () => {
    it('resolves relative path', () => {
      const config = loadConfig()
      const result = resolveDatabasePath(config, '/project')
      expect(result).toBe('/project/.agents/workstation.db')
    })

    it('keeps absolute path', () => {
      const config = {
        ...loadConfig(),
        database: { path: '/var/data/workstation.db' }
      }
      const result = resolveDatabasePath(config, '/project')
      expect(result).toBe('/var/data/workstation.db')
    })
  })

  describe('createDefaultConfig', () => {
    it('creates config file', () => {
      const newDir = join(testDir, 'new-project')
      mkdirSync(newDir, { recursive: true })
      
      const result = createDefaultConfig(newDir)
      expect(result).toBe(join(newDir, '.awrc'))
      
      const config = loadConfig(result)
      expect(config.session).toBe('default')
    })
  })
})
