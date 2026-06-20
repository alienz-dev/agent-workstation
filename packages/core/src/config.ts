import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

const ConfigSchema = z.object({
  session: z.string().optional(),
  daemon: z.object({
    port: z.number().optional(),
    autoStart: z.boolean().optional()
  }).optional(),
  database: z.object({
    path: z.string().optional()
  }).optional(),
  adapters: z.record(z.object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional()
  })).optional(),
  workflow: z.object({
    maxConcurrency: z.number().optional(),
    timeout: z.number().optional()
  }).optional()
})

export type Config = z.infer<typeof ConfigSchema>

const DEFAULT_CONFIG: Config = {
  session: 'default',
  daemon: {
    port: 0,
    autoStart: true
  },
  database: {
    path: '.agents/workstation.db'
  },
  workflow: {
    maxConcurrency: 3,
    timeout: 300000
  }
}

/**
 * Find configuration file starting from cwd and walking up.
 */
export function findConfigFile(startDir: string = process.cwd()): string | null {
  let dir = startDir
  
  for (let i = 0; i < 10; i++) {
    const configPath = join(dir, '.awrc')
    if (existsSync(configPath)) {
      return configPath
    }
    
    const jsonPath = join(dir, 'aw.config.json')
    if (existsSync(jsonPath)) {
      return jsonPath
    }
    
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  
  return null
}

/**
 * Load configuration from file.
 */
export function loadConfig(configPath?: string): Config {
  const path = configPath ?? findConfigFile()
  
  if (!path || !existsSync(path)) {
    return DEFAULT_CONFIG
  }
  
  try {
    const content = readFileSync(path, 'utf-8')
    const raw = JSON.parse(content)
    const parsed = ConfigSchema.parse(raw)
    
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      daemon: { ...DEFAULT_CONFIG.daemon, ...parsed.daemon },
      database: { ...DEFAULT_CONFIG.database, ...parsed.database },
      workflow: { ...DEFAULT_CONFIG.workflow, ...parsed.workflow }
    }
  } catch (error) {
    console.warn(`Failed to load config from ${path}:`, error)
    return DEFAULT_CONFIG
  }
}

/**
 * Get configuration value with environment variable override.
 */
export function getConfigValue<K extends keyof Config>(
  config: Config,
  key: K,
  envVar?: string
): Config[K] {
  if (envVar) {
    const envValue = process.env[envVar]
    if (envValue !== undefined) {
      if (key === 'session') {
        return envValue as Config[K]
      }
      if (key === 'daemon') {
        return { ...config.daemon, port: parseInt(envValue, 10) } as Config[K]
      }
    }
  }
  return config[key]
}

/**
 * Resolve database path relative to project root.
 */
export function resolveDatabasePath(config: Config, projectRoot: string): string {
  const dbPath = config.database?.path ?? DEFAULT_CONFIG.database!.path!
  
  if (dbPath.startsWith('/')) {
    return dbPath
  }
  
  return join(projectRoot, dbPath)
}

/**
 * Create default configuration file.
 */
export function createDefaultConfig(projectRoot: string): string {
  const configPath = join(projectRoot, '.awrc')
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2)
  
  require('fs').writeFileSync(configPath, content)
  return configPath
}
