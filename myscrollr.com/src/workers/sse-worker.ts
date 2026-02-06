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

// Set of connected ports (tabs) — use Set for O(1) removal
const ports = new Set<MessagePort>()

// Remove a port from the set
function removePort(port: MessagePort) {
  ports.delete(port)
  console.log('[SharedWorker] Tab disconnected. Total:', ports.size)

  // If no more tabs, close the SSE connection to save resources
  if (ports.size === 0 && eventSource) {
    console.log('[SharedWorker] No tabs remaining, closing SSE')
    eventSource.close()
    eventSource = null
    retryCount = 0
  }
}

// Broadcast to all connected tabs, pruning dead ports
function broadcast(message: BroadcastMessage) {
  for (const port of ports) {
    try {
      port.postMessage(message)
    } catch {
      // Port is dead (tab closed without sending DISCONNECT)
      removePort(port)
    }
  }
}

function connect() {
  if (eventSource?.readyState === EventSource.OPEN) return
  if (ports.size === 0) return // Don't connect if no tabs are listening

  const url = `${API_URL}/events`

  // Only log on first connect or after failures
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

    // Exponential backoff, cap at 30s
    const timeout = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
      30000,
    )
    retryCount++

    // Only log reconnection attempts after multiple failures
    if (retryCount > 1) {
      console.warn(
        `[SharedWorker] Reconnecting in ${timeout}ms (Attempt ${retryCount})`,
      )
    }

    setTimeout(() => {
      // Only reconnect if there are still tabs listening
      if (ports.size > 0) {
        connect()
      }
    }, timeout)
  }
}

// Handle new connections from tabs
ctx.onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  ports.add(port)
  console.log('[SharedWorker] New tab connected. Total:', ports.size)

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
    } else if (e.data.type === 'DISCONNECT') {
      removePort(port)
    }
  }
}
