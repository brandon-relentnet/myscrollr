import { TrendingUp } from 'lucide-react'
import type { IntegrationManifest, DashboardTabProps } from '@/integrations/types'
import { StreamHeader, InfoCard } from '@/integrations/shared'

function FinanceDashboardTab({
  stream,
  connected,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<TrendingUp size={20} className="text-primary" />}
        title="Finance Stream"
        subtitle="Real-time market data via Finnhub WebSocket"
        connected={connected}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Data Source" value="Finnhub" />
        <InfoCard label="Tracked Symbols" value="50" />
        <InfoCard label="Update Frequency" value="Real-time" />
      </div>

      <div className="bg-base-200/30 border border-base-300/30 rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          About This Stream
        </p>
        <p className="text-xs text-base-content/50 leading-relaxed">
          Tracks 45 stocks and 5 cryptocurrencies (via Binance) in real-time
          using Finnhub's WebSocket API. Price updates, percentage changes, and
          trend direction are delivered to your ticker as they happen.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {['AAPL', 'TSLA', 'NVDA', 'GOOGL', 'AMZN', 'BTC', 'ETH'].map(
            (sym) => (
              <span
                key={sym}
                className="px-2 py-1 rounded bg-base-300/30 border border-base-300/40 text-[10px] font-mono text-base-content/40"
              >
                {sym}
              </span>
            ),
          )}
          <span className="px-2 py-1 text-[10px] font-mono text-base-content/25">
            +43 more
          </span>
        </div>
      </div>
    </div>
  )
}

export const financeIntegration: IntegrationManifest = {
  id: 'finance',
  name: 'Finance',
  tabLabel: 'Finance',
  description: 'Real-time market data via Finnhub',
  icon: TrendingUp,
  DashboardTab: FinanceDashboardTab,
}
