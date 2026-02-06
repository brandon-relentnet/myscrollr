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

interface RealtimeState {
  status: 'connected' | 'disconnected' | 'reconnecting'
  latestTrades: Array<Trade>
  latestGames: Array<Game>
}

export function useRealtime() {
  const [state, setState] = useState<RealtimeState>({
    status: 'disconnected',
    latestTrades: [],
    latestGames: [],
  })

  const workerRef = useRef<SharedWorker | null>(null)

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
      // Cleanup if needed
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
        }
      })
    }
  }

  return state
}
