/// <reference lib="webworker" />

// Define the type for the worker context to avoid TS errors
const ctx: SharedWorkerGlobalScope = self as any

// Define message types
type WorkerMessage =
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'STATUS_REQUEST' }
  | { type: 'PONG' }

type BroadcastMessage =
  | { type: 'STREAM_DATA'; payload: any }
  | { type: 'PING' }
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

// Track connected ports with liveness state
interface PortEntry {
  port: MessagePort
  alive: boolean
}
const portMap = new Map<MessagePort, PortEntry>()

// Remove a port
function removePort(port: MessagePort) {
  portMap.delete(port)

  // If no more tabs, close the SSE connection to save resources
  if (portMap.size === 0 && eventSource) {
    console.log('[SharedWorker] No tabs remaining, closing SSE')
    eventSource.close()
    eventSource = null
    retryCount = 0
  }
}

// Broadcast to all connected tabs, pruning dead ports
function broadcast(message: BroadcastMessage) {
  for (const [port, entry] of portMap) {
    try {
      entry.port.postMessage(message)
    } catch {
      // Port is dead (tab closed without sending DISCONNECT)
      removePort(port)
    }
  }
}

// Heartbeat: ping all ports every 10s, prune those that didn't respond
const HEARTBEAT_INTERVAL = 10000
setInterval(() => {
  if (portMap.size === 0) return

  // Prune ports that didn't respond to the LAST ping
  for (const [port, entry] of portMap) {
    if (!entry.alive) {
      // Didn't respond since last heartbeat — dead port
      removePort(port)
    } else {
      // Mark as not-alive, wait for PONG to set it back
      entry.alive = false
    }
  }

  // Send new ping to all remaining ports
  broadcast({ type: 'PING' })
}, HEARTBEAT_INTERVAL)

function connect() {
  if (eventSource?.readyState === EventSource.OPEN) return
  if (portMap.size === 0) return // Don't connect if no tabs are listening

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
      if (portMap.size > 0) {
        connect()
      }
    }, timeout)
  }
}

// Handle new connections from tabs
ctx.onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  portMap.set(port, { port, alive: true })
  console.log('[SharedWorker] New tab connected. Total:', portMap.size)

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
    } else if (e.data.type === 'PONG') {
      // Mark this port as alive in response to our PING
      const entry = portMap.get(port)
      if (entry) entry.alive = true
    } else if (e.data.type === 'DISCONNECT') {
      removePort(port)
    }
  }
}
