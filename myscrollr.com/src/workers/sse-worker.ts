/// <reference lib="webworker" />

// Define the type for the worker context to avoid TS errors
const ctx: SharedWorkerGlobalScope = self as any

// Define message types
type WorkerMessage =
  | { type: 'CONNECT' }
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

// List of connected ports (tabs)
const ports: Array<MessagePort> = []

// Broadcast to all connected tabs
function broadcast(message: BroadcastMessage) {
  ports.forEach((port) => {
    try {
      port.postMessage(message)
    } catch (e) {
      // Port likely closed, we'll clean up later or let GC handle it
      console.error('Failed to broadcast to port', e)
    }
  })
}

function connect() {
  if (eventSource?.readyState === EventSource.OPEN) return

  const url = `${API_URL}/events`
  console.log('[SharedWorker] Connecting to SSE:', url)

  broadcast({ type: 'CONNECTION_STATUS', status: 'reconnecting' })

  eventSource = new EventSource(url)

  eventSource.onopen = () => {
    console.log('[SharedWorker] Connected')
    retryCount = 0
    broadcast({ type: 'CONNECTION_STATUS', status: 'connected' })
  }

  eventSource.onmessage = (event) => {
    // Handle "ping" comments if browser exposes them, or just ignore.
    // Standard EventSource usually swallows comments starting with ':'.
    // We only care about actual data messages.
    try {
      const data = JSON.parse(event.data)
      broadcast({ type: 'STREAM_DATA', payload: data })
    } catch (e) {
      console.error('[SharedWorker] Failed to parse SSE data:', e)
    }
  }

  eventSource.onerror = () => {
    console.error('[SharedWorker] Connection error')
    eventSource?.close()
    broadcast({ type: 'CONNECTION_STATUS', status: 'disconnected' })

    // Reconnection logic (Exponential Backoff)
    const timeout = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
      30000,
    )

    retryCount++
    console.log(
      `[SharedWorker] Reconnecting in ${timeout}ms (Attempt ${retryCount})`,
    )

    setTimeout(() => {
      connect()
    }, timeout)
  }
}

// Handle new connections from tabs
ctx.onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  ports.push(port)
  console.log('[SharedWorker] New tab connected. Total:', ports.length)

  port.start()

  // Send current status immediately
  port.postMessage({
    type: 'CONNECTION_STATUS',
    status:
      eventSource?.readyState === EventSource.OPEN
        ? 'connected'
        : 'disconnected',
  })

  // Start the stream if not already running
  if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
    connect()
  }

  // Handle messages from the tab
  port.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type === 'STATUS_REQUEST') {
      port.postMessage({
        type: 'CONNECTION_STATUS',
        status:
          eventSource?.readyState === EventSource.OPEN
            ? 'connected'
            : 'disconnected',
      })
    }
  }
}
