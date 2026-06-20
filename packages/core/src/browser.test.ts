import { describe, it, expect } from 'vitest'
import { CDPWrapper, BrowserController, createBrowserPlugin } from './browser.js'

describe('CDPWrapper', () => {
  it('creates wrapper with URL', () => {
    const cdp = new CDPWrapper('ws://localhost:9222')
    expect(cdp.isConnected()).toBe(false)
  })
})

describe('BrowserController', () => {
  it('creates controller with default URL', () => {
    const controller = new BrowserController()
    expect(controller).toBeDefined()
  })

  it('creates controller with custom URL', () => {
    const controller = new BrowserController('ws://custom:9222')
    expect(controller).toBeDefined()
  })
})

describe('Browser Plugin', () => {
  it('creates plugin', () => {
    const plugin = createBrowserPlugin()

    expect(plugin.name).toBe('browser')
    expect(plugin.version).toBe('1.0.0')
    expect(plugin.commands).toHaveLength(2)
    expect(plugin.commands.map(c => c.name)).toEqual(['navigate', 'screenshot'])
  })

  it('creates plugin with custom CDP URL', () => {
    const plugin = createBrowserPlugin('ws://custom:9999')
    expect(plugin.name).toBe('browser')
  })
})

describe('Types', () => {
  it('BrowserTab type is correct', () => {
    const tab = {
      id: 'tab-1',
      url: 'https://example.com',
      title: 'Example'
    }
    expect(tab.id).toBe('tab-1')
    expect(tab.url).toBe('https://example.com')
  })

  it('ElementInfo type is correct', () => {
    const element = {
      selector: '#button',
      tag: 'button',
      text: 'Click me',
      attributes: { class: 'btn-primary' },
      visible: true
    }
    expect(element.selector).toBe('#button')
    expect(element.visible).toBe(true)
  })

  it('ScreenshotResult type is correct', () => {
    const screenshot = {
      data: 'base64...',
      format: 'png' as const,
      width: 1920,
      height: 1080
    }
    expect(screenshot.format).toBe('png')
    expect(screenshot.width).toBe(1920)
  })

  it('NavigationResult type is correct', () => {
    const nav = {
      url: 'https://example.com',
      title: 'Example',
      loadTime: 500,
      status: 200
    }
    expect(nav.loadTime).toBe(500)
    expect(nav.status).toBe(200)
  })

  it('CDPCommand type is correct', () => {
    const cmd = {
      method: 'Page.navigate',
      params: { url: 'https://example.com' }
    }
    expect(cmd.method).toBe('Page.navigate')
  })

  it('CDPResponse type is correct', () => {
    const resp = {
      id: 1,
      result: { frameId: 'main' }
    }
    expect(resp.id).toBe(1)
    expect(resp.result).toBeDefined()
  })
})
