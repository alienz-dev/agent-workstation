import { describe, it, expect } from 'vitest'
import {
  createPluginRegistry,
  registerPlugin,
  getPlugin,
  getPlugins,
  getCommand,
  getCommands,
  initializePlugins
} from './plugins.js'
import type { Plugin, PluginContext } from './types.js'

describe('plugin system', () => {
  it('creates empty registry', () => {
    const registry = createPluginRegistry()
    expect(registry.plugins.size).toBe(0)
    expect(registry.commands.size).toBe(0)
  })

  it('registers a plugin', () => {
    const registry = createPluginRegistry()
    const plugin: Plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [
        { name: 'hello', description: 'Say hello', run: async () => {} }
      ],
      migrations: []
    }
    
    registerPlugin(registry, plugin)
    
    expect(registry.plugins.size).toBe(1)
    expect(registry.commands.size).toBe(1)
    expect(getPlugin(registry, 'test-plugin')).toBe(plugin)
  })

  it('throws on duplicate plugin', () => {
    const registry = createPluginRegistry()
    const plugin: Plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [],
      migrations: []
    }
    
    registerPlugin(registry, plugin)
    expect(() => registerPlugin(registry, plugin)).toThrow()
  })

  it('gets all plugins', () => {
    const registry = createPluginRegistry()
    const plugin1: Plugin = { name: 'plugin1', version: '1.0.0', commands: [], migrations: [] }
    const plugin2: Plugin = { name: 'plugin2', version: '1.0.0', commands: [], migrations: [] }
    
    registerPlugin(registry, plugin1)
    registerPlugin(registry, plugin2)
    
    const plugins = getPlugins(registry)
    expect(plugins).toHaveLength(2)
  })

  it('gets command by full name', () => {
    const registry = createPluginRegistry()
    const plugin: Plugin = {
      name: 'test',
      version: '1.0.0',
      commands: [
        { name: 'cmd', description: 'A command', run: async () => {} }
      ],
      migrations: []
    }
    
    registerPlugin(registry, plugin)
    
    const cmd = getCommand(registry, 'test:cmd')
    expect(cmd).toBeDefined()
    expect(cmd?.command.name).toBe('cmd')
  })

  it('initializes plugins', async () => {
    const registry = createPluginRegistry()
    let initialized = false
    
    const plugin: Plugin = {
      name: 'test',
      version: '1.0.0',
      commands: [],
      migrations: [],
      onInit: async () => { initialized = true }
    }
    
    registerPlugin(registry, plugin)
    
    const context: PluginContext = {
      projectRoot: '/tmp/test',
      methodologyPath: '/tmp/test/methodology'
    }
    
    await initializePlugins(registry, context)
    expect(initialized).toBe(true)
  })
})
