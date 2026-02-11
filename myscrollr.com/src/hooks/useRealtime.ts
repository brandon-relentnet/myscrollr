import { useEffect, useRef, useState } from 'react'
import type { UserPreferences } from '@/api/client'
import { API_BASE } from '@/api/client'

interface RealtimeState {
  status: 'connected' | 'disconnected' | 'reconnecting'
  preferences: UserPreferences | null
}

interface UseRealtimeOptions {
  /** Async function that returns a valid JWT access token, or null if unauthenticated. */
  getToken: () => Promise<string | null>
}

interface CDCEvent {
  metadata?: { table_name?: string }
  record?: Record<string, unknown>
  changes?: Record<string, unknown> | null
  action?: string
}

interface SSEPayload {
  data?: Array<CDCEvent>
}

export function useRealtime({ getToken }: UseRealtimeOptions) {
  const [state, setState] = useState<RealtimeState>({
    status: 'disconnected',
    preferences: null,
  })

  // Keep getToken ref stable across renders so the effect doesn't re-run
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  useEffect(() => {
    let eventSource: EventSource | null = null
    let retryCount = 0
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    async function connect() {
      if (cancelled) return

      // Acquire a valid token before connecting — SSE requires auth
      const token = await getTokenRef.current()
      if (!token || cancelled) {
        setState((prev) => ({ ...prev, status: 'disconnected' }))
        // Retry after a delay in case auth becomes available
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000)
        retryCount++
        retryTimeout = setTimeout(connect, timeout)
        return
      }

      eventSource = new EventSource(
        `${API_BASE}/events?token=${encodeURIComponent(token)}`,
      )

      eventSource.onopen = () => {
        retryCount = 0
        setState((prev) => ({ ...prev, status: 'connected' }))
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleStreamData(data)
        } catch {
          // Ignore unparseable messages (e.g. ping comments)
        }
      }

      eventSource.onerror = () => {
        eventSource?.close()
        setState((prev) => ({ ...prev, status: 'disconnected' }))

        const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000)
        retryCount++
        retryTimeout = setTimeout(connect, timeout)
      }
    }

    connect()

    return () => {
      cancelled = true
      eventSource?.close()
      if (retryTimeout) clearTimeout(retryTimeout)
    }
  }, [])

  const handleStreamData = (data: SSEPayload) => {
    // Server-side filtering: all records in the SSE stream are already
    // scoped to the authenticated user. No client-side logto_sub/guid
    // checks are needed.

    if (data?.data && Array.isArray(data.data)) {
      data.data.forEach((event: CDCEvent) => {
        const table = event.metadata?.table_name
        const record = event.record

        if (!record) return

        if (table === 'user_preferences') {
          setState((prev) => ({
            ...prev,
            preferences: record as unknown as UserPreferences,
          }))
        }
      })
    }
  }

  return { ...state }
}
