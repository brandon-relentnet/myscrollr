import { useState } from 'react'
import { Eye, EyeOff, Trash2, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { Stream } from '@/api/client'

/** Toggle switch used in stream headers */
function ToggleSwitch({ active, hex }: { active: boolean; hex: string }) {
  return (
    <span
      className="block h-4 w-7 rounded-full relative transition-colors ml-1"
      style={{ background: active ? hex : undefined }}
    >
      {!active && (
        <span className="absolute inset-0 rounded-full bg-base-300" />
      )}
      <motion.span
        className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white"
        animate={{ x: active ? 12 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </span>
  )
}

/** Shared header for all stream config panels */
export function StreamHeader({
  stream,
  icon,
  title,
  subtitle,
  connected,
  subscriptionTier,
  hex,
  onToggle,
  onDelete,
}: {
  stream: Stream
  icon: React.ReactNode
  title: string
  subtitle: string
  connected?: boolean
  subscriptionTier?: string
  hex: string
  onToggle: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const active = stream.visible
  const isUplink = subscriptionTier === 'uplink'

  // Determine badge text and style based on tier
  const badgeLabel = isUplink ? (connected ? 'Live' : 'Offline') : 'Polling'
  const badgeActive = isUplink ? !!connected : true

  return (
    <div className="space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
            {/* Icon badge container — DESIGN.md pattern */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: `${hex}15`,
                boxShadow: `0 0 15px ${hex}15, 0 0 0 1px ${hex}20`,
              }}
            >
              {icon}
            </div>
            {title}
          </h2>
          <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
            {subtitle}
          </p>
        </div>
        {(connected !== undefined || subscriptionTier) && (
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
              !badgeActive ? 'bg-base-300/30 border-base-300/25' : ''
            }`}
            style={
              badgeActive
                ? {
                    background: `${hex}10`,
                    borderColor: `${hex}20`,
                  }
                : undefined
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${badgeActive ? 'animate-pulse' : 'bg-base-content/30'}`}
              style={badgeActive ? { background: hex } : undefined}
            />
            <span
              className={`text-[9px] font-mono uppercase ${!badgeActive ? 'text-base-content/50' : ''}`}
              style={badgeActive ? { color: hex } : undefined}
            >
              {badgeLabel}
            </span>
          </span>
        )}
      </div>

      {/* Toggle + Delete */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onToggle}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
            !active
              ? 'bg-base-200/40 border-base-300/25 text-base-content/40'
              : ''
          }`}
          style={
            active
              ? {
                  background: `${hex}14`,
                  borderColor: `${hex}33`,
                  color: hex,
                }
              : undefined
          }
        >
          {active ? <Eye size={12} /> : <EyeOff size={12} />}
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {active ? 'On Ticker' : 'Off'}
          </span>
          <ToggleSwitch active={active} hex={hex} />
        </button>

        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-base-content/40 uppercase">
                Remove?
              </span>
              <button
                onClick={() => {
                  onDelete()
                  setConfirmDelete(false)
                }}
                className="px-3 py-2 rounded-lg border border-error/30 text-error text-[10px] font-bold uppercase tracking-widest hover:bg-error/10 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="p-2 rounded-lg border border-base-300/25 text-base-content/30 hover:text-base-content/50 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2.5 rounded-lg border border-base-300/25 text-base-content/20 hover:text-error hover:border-error/30 transition-colors"
              title="Remove stream"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Small stat card used in stream configs */
export function InfoCard({
  label,
  value,
  hex,
}: {
  label: string
  value: string
  hex?: string
}) {
  return (
    <div className="bg-base-200/40 border border-base-300/25 rounded-lg p-4 relative overflow-hidden">
      {/* Accent top line — DESIGN.md card pattern */}
      {hex && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
          }}
        />
      )}
      <p className="text-[10px] text-base-content/30 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-sm font-bold font-mono">{value}</p>
    </div>
  )
}
