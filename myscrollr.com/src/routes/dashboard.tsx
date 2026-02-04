import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useState } from 'react'
import { TrendingUp, Trophy, BarChart3 } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { isAuthenticated, isLoading, signIn } = useLogto()
  const [activeTab, setActiveTab] = useState<'finance' | 'sports' | 'fantasy'>('finance')

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Sign in to view your dashboard</h1>
          <button
            onClick={signIn}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-2">Your personalized data overview</p>
        </div>

        <div className="flex gap-2 mb-6 border-b border-gray-800 pb-4">
          <TabButton
            active={activeTab === 'finance'}
            onClick={() => setActiveTab('finance')}
            icon={<TrendingUp size={18} />}
            label="Finance"
          />
          <TabButton
            active={activeTab === 'sports'}
            onClick={() => setActiveTab('sports')}
            icon={<Trophy size={18} />}
            label="Sports"
          />
          <TabButton
            active={activeTab === 'fantasy'}
            onClick={() => setActiveTab('fantasy')}
            icon={<BarChart3 size={18} />}
            label="Fantasy"
          />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 min-h-[400px]">
          {activeTab === 'finance' && <FinancePanel />}
          {activeTab === 'sports' && <SportsPanel />}
          {activeTab === 'fantasy' && <FantasyPanel />}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function FinancePanel() {
  const [trades, setTrades] = useState<{ symbol: string; price: number; change: number }[]>([])
  const [loading, setLoading] = useState(true)

  // TODO: Replace with actual API call
  const fetchFinance = async () => {
    setLoading(true)
    // Simulated data - replace with actual API call
    setTimeout(() => {
      setTrades([
        { symbol: 'AAPL', price: 178.52, change: 2.34 },
        { symbol: 'GOOGL', price: 141.23, change: -0.45 },
        { symbol: 'MSFT', price: 378.91, change: 1.23 },
      ])
      setLoading(false)
    }, 500)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Market Data</h2>
        <button
          onClick={fetchFinance}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => (
            <div
              key={trade.symbol}
              className="flex items-center justify-between p-4 bg-gray-800 rounded-xl"
            >
              <span className="font-medium">{trade.symbol}</span>
              <div className="text-right">
                <span className="font-semibold">${trade.price.toFixed(2)}</span>
                <span
                  className={`ml-3 text-sm ${
                    trade.change >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {trade.change >= 0 ? '+' : ''}
                  {trade.change.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SportsPanel() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Live Scores</h2>
      <p className="text-gray-400">Sports data will appear here.</p>
    </div>
  )
}

function FantasyPanel() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Yahoo Fantasy</h2>
      <p className="text-gray-400">Connect your Yahoo account to see your leagues.</p>
    </div>
  )
}
