export interface BrowserTab {
  id: string
  url: string
  title?: string
}

export interface ElementInfo {
  selector: string
  tag: string
  text?: string
  attributes: Record<string, string>
  visible: boolean
}

export interface ScreenshotResult {
  data: string
  format: 'png' | 'jpeg'
  width: number
  height: number
}

export interface NavigationResult {
  url: string
  title: string
  loadTime: number
  status: number
}

export interface CDPCommand {
  method: string
  params?: Record<string, unknown>
}

export interface CDPResponse {
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

export class CDPWrapper {
  private ws: WebSocket | null = null
  private commandId: number = 0
  private pendingCommands: Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }> = new Map()
  private url: string

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => resolve()
      this.ws.onerror = (err) => reject(new Error('WebSocket connection failed'))
      
      this.ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data as string) as CDPResponse
          const pending = this.pendingCommands.get(response.id)
          
          if (pending) {
            this.pendingCommands.delete(response.id)
            
            if (response.error) {
              pending.reject(new Error(response.error.message))
            } else {
              pending.resolve(response.result)
            }
          }
        } catch {
          // Ignore parse errors for events
        }
      }
    })
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws) {
      throw new Error('Not connected')
    }

    const id = ++this.commandId
    const command = { id, method, params }

    return new Promise((resolve, reject) => {
      this.pendingCommands.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ws!.send(JSON.stringify(command))
    })
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingCommands.clear()
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

export class BrowserController {
  private cdp: CDPWrapper
  private sessionId: string | null = null
  private frameId: string | null = null

  constructor(cdpUrl: string = 'ws://127.0.0.1:9222/devtools/browser') {
    this.cdp = new CDPWrapper(cdpUrl)
  }

  async connect(): Promise<void> {
    await this.cdp.connect()
    
    const { sessionId } = await this.cdp.send<{ sessionId: string }>(
      'Target.attachToBrowserTarget',
      {}
    )
    this.sessionId = sessionId
  }

  async disconnect(): Promise<void> {
    await this.cdp.disconnect()
    this.sessionId = null
    this.frameId = null
  }

  async navigate(url: string): Promise<NavigationResult> {
    const start = Date.now()
    
    await this.cdp.send('Page.navigate', { url })
    
    await this.cdp.send('Page.loadEventFired')
    
    const { result } = await this.cdp.send<{
      result: { result: { value: string } }
    }>('Runtime.evaluate', {
      expression: 'document.title'
    })
    
    const title = result?.result?.value ?? ''
    
    return {
      url,
      title,
      loadTime: Date.now() - start,
      status: 200
    }
  }

  async getCurrentUrl(): Promise<string> {
    const { result } = await this.cdp.send<{
      result: { result: { value: string } }
    }>('Runtime.evaluate', {
      expression: 'window.location.href'
    })
    
    return result?.result?.value ?? ''
  }

  async getTitle(): Promise<string> {
    const { result } = await this.cdp.send<{
      result: { result: { value: string } }
    }>('Runtime.evaluate', {
      expression: 'document.title'
    })
    
    return result?.result?.value ?? ''
  }

  async screenshot(format: 'png' | 'jpeg' = 'png'): Promise<ScreenshotResult> {
    const { result } = await this.cdp.send<{
      result: { data: string; width: number; height: number }
    }>('Page.captureScreenshot', {
      format
    })
    
    return {
      data: result.data,
      format,
      width: result.width,
      height: result.height
    }
  }

  async querySelector(selector: string): Promise<ElementInfo | null> {
    const { result } = await this.cdp.send<{
      result: { result: { objectId: string } }
    }>('Runtime.evaluate', {
      expression: `document.querySelector('${selector}')`
    })
    
    if (!result?.result?.objectId) {
      return null
    }
    
    const objectId = result.result.objectId
    
    const { result: props } = await this.cdp.send<{
      result: Array<{ name: string; value?: { value: unknown } }>
    }>('Runtime.getProperties', {
      objectId,
      ownProperties: true
    })
    
    const attributes: Record<string, string> = {}
    let tag = ''
    let text = ''
    let visible = true
    
    for (const prop of props) {
      if (prop.name === 'tagName') {
        tag = String(prop.value?.value ?? '').toLowerCase()
      } else if (prop.name === 'textContent') {
        text = String(prop.value?.value ?? '')
      } else if (prop.name === 'offsetParent') {
        visible = prop.value?.value !== null
      }
    }
    
    return {
      selector,
      tag,
      text,
      attributes,
      visible
    }
  }

  async querySelectorAll(selector: string): Promise<ElementInfo[]> {
    const { result } = await this.cdp.send<{
      result: { result: { objectId: string } }
    }>('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('${selector}'))`
    })
    
    if (!result?.result?.objectId) {
      return []
    }
    
    const { result: props } = await this.cdp.send<{
      result: Array<{ name: string; value?: { objectId: string } }>
    }>('Runtime.getProperties', {
      objectId: result.result.objectId,
      ownProperties: true
    })
    
    const elements: ElementInfo[] = []
    
    for (const prop of props) {
      if (/^\d+$/.test(prop.name) && prop.value?.objectId) {
        const element = await this.getElementInfo(prop.value.objectId, selector)
        if (element) {
          elements.push(element)
        }
      }
    }
    
    return elements
  }

  private async getElementInfo(objectId: string, selector: string): Promise<ElementInfo | null> {
    const { result: props } = await this.cdp.send<{
      result: Array<{ name: string; value?: { value: unknown } }>
    }>('Runtime.getProperties', {
      objectId,
      ownProperties: true
    })
    
    let tag = ''
    let text = ''
    let visible = true
    
    for (const prop of props) {
      if (prop.name === 'tagName') {
        tag = String(prop.value?.value ?? '').toLowerCase()
      } else if (prop.name === 'textContent') {
        text = String(prop.value?.value ?? '')
      } else if (prop.name === 'offsetParent') {
        visible = prop.value?.value !== null
      }
    }
    
    return {
      selector,
      tag,
      text,
      attributes: {},
      visible
    }
  }

  async click(selector: string): Promise<boolean> {
    const element = await this.querySelector(selector)
    if (!element || !element.visible) {
      return false
    }
    
    await this.cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('${selector}').click()`
    })
    
    return true
  }

  async type(selector: string, text: string): Promise<boolean> {
    const element = await this.querySelector(selector)
    if (!element || !element.visible) {
      return false
    }
    
    await this.cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('${selector}').value = '${text}'`
    })
    
    return true
  }

  async extract<T>(script: string): Promise<T> {
    const { result } = await this.cdp.send<{
      result: { result: { value: T } }
    }>('Runtime.evaluate', {
      expression: script
    })
    
    return result?.result?.value as T
  }

  async waitForSelector(selector: string, timeout: number = 5000): Promise<boolean> {
    const start = Date.now()
    
    while (Date.now() - start < timeout) {
      const element = await this.querySelector(selector)
      if (element && element.visible) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return false
  }

  async getTabs(): Promise<BrowserTab[]> {
    const { result: targets } = await this.cdp.send<{
      result: Array<{ targetId: string; url: string; title?: string }>
    }>('Target.getTargets')
    
    return targets
      .filter((t): t is { targetId: string; url: string; title?: string } => !!t.url)
      .map(t => ({
        id: t.targetId,
        url: t.url,
        title: t.title
      }))
  }
}

export function createBrowserPlugin(cdpUrl?: string) {
  return {
    name: 'browser',
    version: '1.0.0',
    controller: new BrowserController(cdpUrl),
    commands: [
      {
        name: 'navigate',
        description: 'Navigate to URL',
        async run(url: string) {
          const controller = new BrowserController(cdpUrl)
          await controller.connect()
          const result = await controller.navigate(url)
          await controller.disconnect()
          return result
        }
      },
      {
        name: 'screenshot',
        description: 'Take screenshot',
        async run(format: 'png' | 'jpeg' = 'png') {
          const controller = new BrowserController(cdpUrl)
          await controller.connect()
          const result = await controller.screenshot(format)
          await controller.disconnect()
          return result
        }
      }
    ]
  }
}
