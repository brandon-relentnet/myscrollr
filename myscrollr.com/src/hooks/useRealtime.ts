import { useEffect, useRef, useState } from 'react'

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
  yahoo: YahooState
}

export function useRealtime() {
  const [state, setState] = useState<RealtimeState>({
    status: 'disconnected',
    latestTrades: [],
    latestGames: [],
    yahoo: { leagues: {}, standings: {}, matchups: {} },
  })

  const workerRef = useRef<SharedWorker | null>(null)
  // Track the user's Yahoo GUID to filter SSE events (prevents cross-user data leaking)
  const userGuidRef = useRef<string | null>(null)

  useEffect(() => {
    // 1. Initialize Shared Worker
    const worker = new SharedWorker(
      new URL('../workers/sse-worker.ts', import.meta.url),
      { type: 'module', name: 'scrollr-stream' },
    )

    workerRef.current = worker

    // 2. Handle Messages from Worker
    worker.port.onmessage = (event) => {
      const { type, payload, status } = event.data

      if (type === 'CONNECTION_STATUS') {
        setState((prev) => ({ ...prev, status }))
      } else if (type === 'STREAM_DATA') {
        handleStreamData(payload)
      }
    }

    worker.port.start()

    // 3. Initial Status Request
    worker.port.postMessage({ type: 'STATUS_REQUEST' })

    return () => {
      // Notify the SharedWorker to remove this port from its set
      worker.port.postMessage({ type: 'DISCONNECT' })
      worker.port.close()
      workerRef.current = null
    }
  }, [])

  const handleStreamData = (data: any) => {
    // Sequin payload structure based on user test:
    // {"data":[{"action":"update","changes":...,"metadata":{ "table_name": "trades" },"record":{...}}]}

    if (data?.data && Array.isArray(data.data)) {
      data.data.forEach((event: any) => {
        const table = event.metadata?.table_name
        const record = event.record

        if (!record) return

        if (table === 'trades') {
          setState((prev) => {
            // Check if trade exists
            const idx = prev.latestTrades.findIndex(
              (t) => t.symbol === record.symbol,
            )
            let newTrades = [...prev.latestTrades]

            if (idx >= 0) {
              // Update existing
              newTrades[idx] = { ...newTrades[idx], ...record }
            } else {
              // Add new to top
              newTrades = [record, ...newTrades]
            }

            // Limit size
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
        } else if (table === 'yahoo_leagues') {
          // Only accept leagues belonging to this user — reject if GUID unknown or mismatched
          if (!userGuidRef.current || record.guid !== userGuidRef.current) return
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
          // Only accept standings for leagues we already know about
          if (!userGuidRef.current) return
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
          if (!userGuidRef.current) return
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
        }
      })
    }
  }

  const setInitialYahoo = (yahoo: YahooState) => {
    // Extract the user's GUID from the first league record for SSE filtering
    const firstLeague = Object.values(yahoo.leagues)[0]
    if (firstLeague?.guid) {
      userGuidRef.current = firstLeague.guid
    }

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
    userGuidRef.current = null
    setState((prev) => ({
      ...prev,
      yahoo: { leagues: {}, standings: {}, matchups: {} },
    }))
  }

  return { ...state, setInitialYahoo, clearYahoo }
}
