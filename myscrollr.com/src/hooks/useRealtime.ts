import { useEffect, useRef, useState } from 'react'
import type { UserPreferences } from '../api/client'

// Define types locally if not available globally yet
export interface Trade {
  symbol: string
  price: number | string
  previous_close?: number
  percentage_change?: number | string
  price_change?: number | string
  direction?: 'up' | 'down'
  last_updated?: string
  [key: string]: any
}

export interface Game {
  id: number | string
  league: string
  home_team_name: string
  away_team_name: string
  home_team_score: number | string
  away_team_score: number | string
  short_detail?: string // e.g. "Q4 2:30"
  state?: string // e.g. "in_progress"
  [key: string]: any
}

export interface RssItem {
  id: number
  feed_url: string
  guid: string
  title: string
  link: string
  description: string
  source_name: string
  published_at: string | null
  created_at: string
  updated_at: string
}

// Yahoo data as stored in DB rows (keyed by league_key/team_key)
export interface YahooLeagueRecord {
  league_key: string
  guid: string
  name: string
  game_code: string
  season: string
  data: any // JSONB blob from yahoo API
}

export interface YahooStandingsRecord {
  league_key: string
  data: any
}

export interface YahooMatchupsRecord {
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
  latestTrades: Array<Trade>
  latestGames: Array<Game>
  latestRssItems: Array<RssItem>
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
    latestTrades: [],
    latestGames: [],
    latestRssItems: [],
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

        if (table === 'trades') {
          setState((prev) => {
            const idx = prev.latestTrades.findIndex(
              (t) => t.symbol === record.symbol,
            )
            let newTrades = [...prev.latestTrades]

            if (idx >= 0) {
              newTrades[idx] = { ...newTrades[idx], ...record }
            } else {
              newTrades = [record, ...newTrades]
            }

            return { ...prev, latestTrades: newTrades.slice(0, 50) }
          })
        } else if (table === 'games') {
          setState((prev) => {
            const idx = prev.latestGames.findIndex((g) => g.id === record.id)
            let newGames = [...prev.latestGames]

            if (idx >= 0) {
              newGames[idx] = { ...newGames[idx], ...record }
            } else {
              newGames = [record, ...newGames]
            }

            return { ...prev, latestGames: newGames.slice(0, 50) }
          })
        } else if (table === 'rss_items') {
          setState((prev) => {
            const idx = prev.latestRssItems.findIndex(
              (r) =>
                r.feed_url === record.feed_url && r.guid === record.guid,
            )
            let newItems = [...prev.latestRssItems]

            if (event.action === 'delete') {
              if (idx >= 0) {
                newItems.splice(idx, 1)
              }
              return { ...prev, latestRssItems: newItems }
            }

            if (idx >= 0) {
              newItems[idx] = { ...newItems[idx], ...record }
            } else {
              newItems = [record, ...newItems]
            }

            // Sort by published_at DESC, limit 50
            newItems.sort((a, b) => {
              const aTime = a.published_at
                ? new Date(a.published_at).getTime()
                : 0
              const bTime = b.published_at
                ? new Date(b.published_at).getTime()
                : 0
              return bTime - aTime
            })

            return { ...prev, latestRssItems: newItems.slice(0, 50) }
          })
        } else if (table === 'yahoo_leagues') {
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

  const setPreferences = (prefs: UserPreferences | null) => {
    setState((prev) => ({ ...prev, preferences: prefs }))
  }

  return { ...state, setInitialYahoo, clearYahoo, setPreferences }
}
