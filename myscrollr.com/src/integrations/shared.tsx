import { useState } from 'react'
import { Eye, EyeOff, Trash2, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { Stream } from '@/api/client'

/** Toggle switch used in stream headers */
function ToggleSwitch({ active }: { active: boolean }) {
  return (
    <span
      className={`block h-4 w-7 rounded-full relative transition-colors ml-1 ${
        active ? 'bg-primary' : 'bg-base-300'
      }`}
    >
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
  onToggle,
  onDelete,
}: {
  stream: Stream
  icon: React.ReactNode
  title: string
  subtitle: string
  connected?: boolean
  subscriptionTier?: string
  onToggle: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const active = stream.visible
  const isUplink = subscriptionTier === 'uplink'

  // Determine badge text and style based on tier
  const badgeLabel = isUplink
    ? connected
      ? 'Live'
      : 'Offline'
    : 'Polling'
  const badgeActive = isUplink ? !!connected : true
  const badgeColor = isUplink
    ? connected
      ? 'bg-primary/10 border-primary/20'
      : 'bg-base-300/30 border-base-300'
    : 'bg-info/10 border-info/20'
  const dotColor = isUplink
    ? connected
      ? 'bg-primary'
      : 'bg-base-content/30'
    : 'bg-info'
  const textColor = isUplink
    ? connected
      ? 'text-primary'
      : 'text-base-content/50'
    : 'text-info'

  return (
    <div className="space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
            {icon}
            {title}
          </h2>
          <p className="text-xs text-base-content/40 mt-1 uppercase tracking-wide">
            {subtitle}
          </p>
        </div>
        {(connected !== undefined || subscriptionTier) && (
          <span
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${badgeColor} border`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${dotColor} ${badgeActive ? 'animate-pulse' : ''}`}
            />
            <span
              className={`text-[9px] font-mono ${textColor} uppercase`}
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
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
            active
              ? 'bg-primary/8 border-primary/20 text-primary'
              : 'bg-base-200/40 border-base-300/40 text-base-content/40'
          }`}
        >
          {active ? <Eye size={12} /> : <EyeOff size={12} />}
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {active ? 'On Ticker' : 'Off'}
          </span>
          <ToggleSwitch active={active} />
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
                className="p-2 rounded-lg border border-base-300/40 text-base-content/30 hover:text-base-content/50 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2.5 rounded-lg border border-base-300/40 text-base-content/20 hover:text-error hover:border-error/30 transition-colors"
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
export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-base-200/40 border border-base-300/40 rounded-lg p-4">
      <p className="text-[10px] text-base-content/30 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-sm font-bold font-mono">{value}</p>
    </div>
  )
}
