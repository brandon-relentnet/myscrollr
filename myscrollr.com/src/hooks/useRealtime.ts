import { useEffect, useRef, useState } from 'react'
import type { UserPreferences } from '../api/client'

// Yahoo data as stored in DB rows (keyed by league_key/team_key)
interface YahooLeagueRecord {
  league_key: string
  guid: string
  name: string
  game_code: string
  season: string
  data: any // JSONB blob from yahoo API
}

interface YahooStandingsRecord {
  league_key: string
  data: any
}

interface YahooMatchupsRecord {
  team_key: string
  data: any
}

export interface YahooState {
  leagues: Record<string, YahooLeagueRecord>
  standings: Record<string, YahooStandingsRecord>
  matchups: Record<string, YahooMatchupsRecord>
}

interface RealtimeState {
  status: 'connected' | 'disconnected' | 'reconnecting'
  yahoo: YahooState
  preferences: UserPreferences | null
}

interface UseRealtimeOptions {
  /** Async function that returns a valid JWT access token, or null if unauthenticated. */
  getToken: () => Promise<string | null>
}

export function useRealtime({ getToken }: UseRealtimeOptions) {
  const [state, setState] = useState<RealtimeState>({
    status: 'disconnected',
    yahoo: { leagues: {}, standings: {}, matchups: {} },
    preferences: null,
  })

  // Keep getToken ref stable across renders so the effect doesn't re-run
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  useEffect(() => {
    const apiUrl =
      import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'
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
        `${apiUrl}/events?token=${encodeURIComponent(token)}`,
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

  const handleStreamData = (data: any) => {
    // Server-side filtering: all records in the SSE stream are already
    // scoped to the authenticated user. No client-side logto_sub/guid
    // checks are needed.

    if (data?.data && Array.isArray(data.data)) {
      data.data.forEach((event: any) => {
        const table = event.metadata?.table_name
        const record = event.record

        if (!record) return

        if (table === 'yahoo_leagues') {
          setState((prev) => ({
            ...prev,
            yahoo: {
              ...prev.yahoo,
              leagues: {
                ...prev.yahoo.leagues,
                [record.league_key]: record,
              },
            },
          }))
        } else if (table === 'yahoo_standings') {
          setState((prev) => {
            if (!prev.yahoo.leagues[record.league_key]) return prev
            return {
              ...prev,
              yahoo: {
                ...prev.yahoo,
                standings: {
                  ...prev.yahoo.standings,
                  [record.league_key]: record,
                },
              },
            }
          })
        } else if (table === 'yahoo_matchups') {
          setState((prev) => ({
            ...prev,
            yahoo: {
              ...prev.yahoo,
              matchups: {
                ...prev.yahoo.matchups,
                [record.team_key]: record,
              },
            },
          }))
        } else if (table === 'user_preferences') {
          setState((prev) => ({
            ...prev,
            preferences: record as unknown as UserPreferences,
          }))
        }
      })
    }
  }

  const setInitialYahoo = (yahoo: YahooState) => {
    // REST data is authoritative — it replaces SSE-accumulated state.
    // SSE updates that arrived after this REST fetch are merged on top.
    setState((prev) => ({
      ...prev,
      yahoo: {
        leagues: { ...prev.yahoo.leagues, ...yahoo.leagues },
        standings: { ...prev.yahoo.standings, ...yahoo.standings },
        matchups: { ...prev.yahoo.matchups, ...yahoo.matchups },
      },
    }))
  }

  const clearYahoo = () => {
    setState((prev) => ({
      ...prev,
      yahoo: { leagues: {}, standings: {}, matchups: {} },
    }))
  }

  return { ...state, setInitialYahoo, clearYahoo }
}
