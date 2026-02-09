import { Cpu } from 'lucide-react'
import type { IntegrationManifest, DashboardTabProps } from '../../types'
import { StreamHeader, InfoCard } from '../../shared'

function SportsDashboardTab({
  stream,
  connected,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  const leagues = ['NFL', 'NBA', 'NHL', 'MLB']

  return (
    <div className="space-y-6">
      <StreamHeader
        stream={stream}
        icon={<Cpu size={20} className="text-primary" />}
        title="Sports Stream"
        subtitle="Live scores via ESPN polling"
        connected={connected}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Data Source" value="ESPN" />
        <InfoCard label="Leagues" value={String(leagues.length)} />
        <InfoCard label="Poll Interval" value="1 min" />
      </div>

      <div className="bg-base-200/30 border border-base-300/30 rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          Tracked Leagues
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {leagues.map((league) => (
            <div
              key={league}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-base-200/50 border border-base-300/40"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {league}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-base-content/40 leading-relaxed pt-2">
          Scores are polled from ESPN every minute. Active, upcoming, and
          recently completed games are delivered to your ticker.
        </p>
      </div>
    </div>
  )
}

export const sportsIntegration: IntegrationManifest = {
  id: 'sports',
  name: 'Sports',
  tabLabel: 'Sports',
  description: 'Live scores via ESPN',
  icon: Cpu,
  DashboardTab: SportsDashboardTab,
}
