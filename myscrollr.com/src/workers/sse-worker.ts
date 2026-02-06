/// <reference lib="webworker" />

const ctx: SharedWorkerGlobalScope = self as any

type WorkerMessage =
  | { type: 'DISCONNECT' }
  | { type: 'STATUS_REQUEST' }

type BroadcastMessage =
  | { type: 'STREAM_DATA'; payload: any }
  | {
      type: 'CONNECTION_STATUS'
      status: 'connected' | 'disconnected' | 'reconnecting'
    }

// Connection state
let eventSource: EventSource | null = null
let retryCount = 0
const INITIAL_RETRY_DELAY = 1000
const API_URL =
  import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'

// Connected ports (tabs)
const ports = new Set<MessagePort>()

// Broadcast to all tabs, prune dead ports on failure
function broadcast(message: BroadcastMessage) {
  for (const port of ports) {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }
}

function connect() {
  if (eventSource?.readyState === EventSource.OPEN) return

  const url = `${API_URL}/events`

  if (retryCount === 0) {
    console.log('[SharedWorker] Connecting to SSE:', url)
  }

  broadcast({ type: 'CONNECTION_STATUS', status: 'reconnecting' })

  eventSource = new EventSource(url)

  eventSource.onopen = () => {
    if (retryCount > 0) {
      console.log('[SharedWorker] Reconnected after', retryCount, 'attempt(s)')
    } else {
      console.log('[SharedWorker] Connected')
    }
    retryCount = 0
    broadcast({ type: 'CONNECTION_STATUS', status: 'connected' })
  }

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      broadcast({ type: 'STREAM_DATA', payload: data })
    } catch (e) {
      console.error('[SharedWorker] Failed to parse SSE data:', e)
    }
  }

  eventSource.onerror = () => {
    eventSource?.close()
    broadcast({ type: 'CONNECTION_STATUS', status: 'disconnected' })

    const timeout = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
      30000,
    )
    retryCount++

    if (retryCount > 1) {
      console.warn(
        `[SharedWorker] Reconnecting in ${timeout}ms (Attempt ${retryCount})`,
      )
    }

    setTimeout(connect, timeout)
  }
}

// Handle new tab connections
ctx.onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  ports.add(port)
  port.start()

  // Send current status
  port.postMessage({
    type: 'CONNECTION_STATUS',
    status:
      eventSource?.readyState === EventSource.OPEN
        ? 'connected'
        : 'disconnected',
  })

  // Start SSE if not running
  if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
    connect()
  }

  port.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type === 'STATUS_REQUEST') {
      port.postMessage({
        type: 'CONNECTION_STATUS',
        status:
          eventSource?.readyState === EventSource.OPEN
            ? 'connected'
            : 'disconnected',
      })
    } else if (e.data.type === 'DISCONNECT') {
      ports.delete(port)
    }
  }
}
