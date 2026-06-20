/**
 * Plugin registry and lifecycle management.
 */
import type { Plugin, PluginCommand, PluginContext } from './types.js'

export interface PluginRegistry {
  plugins: Map<string, Plugin>
  commands: Map<string, { plugin: string; command: PluginCommand }>
}

/**
 * Create a new plugin registry.
 */
export function createPluginRegistry(): PluginRegistry {
  return {
    plugins: new Map(),
    commands: new Map()
  }
}

/**
 * Register a plugin.
 */
export function registerPlugin(registry: PluginRegistry, plugin: Plugin): void {
  if (registry.plugins.has(plugin.name)) {
    throw new Error(`Plugin '${plugin.name}' is already registered`)
  }
  
  registry.plugins.set(plugin.name, plugin)
  
  for (const cmd of plugin.commands) {
    const fullName = `${plugin.name}:${cmd.name}`
    if (registry.commands.has(fullName)) {
      throw new Error(`Command '${fullName}' is already registered`)
    }
    registry.commands.set(fullName, { plugin: plugin.name, command: cmd })
  }
}

/**
 * Get a registered plugin.
 */
export function getPlugin(registry: PluginRegistry, name: string): Plugin | undefined {
  return registry.plugins.get(name)
}

/**
 * Get all registered plugins.
 */
export function getPlugins(registry: PluginRegistry): Plugin[] {
  return Array.from(registry.plugins.values())
}

/**
 * Get a registered command.
 */
export function getCommand(registry: PluginRegistry, fullName: string): { plugin: string; command: PluginCommand } | undefined {
  return registry.commands.get(fullName)
}

/**
 * Get all registered commands.
 */
export function getCommands(registry: PluginRegistry): Map<string, { plugin: string; command: PluginCommand }> {
  return registry.commands
}

/**
 * Initialize all plugins.
 */
export async function initializePlugins(registry: PluginRegistry, context: PluginContext): Promise<void> {
  for (const [name, plugin] of registry.plugins) {
    if (plugin.onInit) {
      try {
        await plugin.onInit(context)
      } catch (error) {
        console.error(`Plugin '${name}' failed to initialize:`, error)
      }
    }
  }
}

/**
 * Notify plugins of session start.
 */
export async function notifySessionStart(registry: PluginRegistry, context: PluginContext): Promise<void> {
  for (const [name, plugin] of registry.plugins) {
    if (plugin.onSessionStart) {
      try {
        await plugin.onSessionStart(context)
      } catch (error) {
        console.error(`Plugin '${name}' failed on session start:`, error)
      }
    }
  }
}

/**
 * Notify plugins of session end.
 */
export async function notifySessionEnd(registry: PluginRegistry, context: PluginContext): Promise<void> {
  for (const [name, plugin] of registry.plugins) {
    if (plugin.onSessionEnd) {
      try {
        await plugin.onSessionEnd(context)
      } catch (error) {
        console.error(`Plugin '${name}' failed on session end:`, error)
      }
    }
  }
}

/**
 * Notify plugins of agent completion.
 */
export async function notifyAgentDone(
  registry: PluginRegistry,
  context: PluginContext,
  result: { agentId: string; status: string; summary: string; changes?: unknown[]; verification?: unknown; decisions?: Record<string, string> }
): Promise<void> {
  for (const [name, plugin] of registry.plugins) {
    if (plugin.onAgentDone) {
      try {
        await plugin.onAgentDone(context, result as any)
      } catch (error) {
        console.error(`Plugin '${name}' failed on agent done:`, error)
      }
    }
  }
}
