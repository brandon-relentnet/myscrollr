import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Eye,
  EyeOff,
  Globe,
  Layers,
  Monitor,
  Move,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import type { UserPreferences } from '@/api/client'
import { getPreferences, updatePreferences } from '@/api/client'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  getToken: () => Promise<string | null>
  /** Current preferences from SSE/CDC — when set, overrides local state */
  serverPreferences: UserPreferences | null
}

const DEFAULT_PREFS: UserPreferences = {
  feed_mode: 'comfort',
  feed_position: 'bottom',
  feed_behavior: 'overlay',
  feed_enabled: true,
  enabled_sites: [],
  disabled_sites: [],
  subscription_tier: 'free',
  updated_at: '',
}

export default function SettingsPanel({
  open,
  onClose,
  getToken,
  serverPreferences,
}: SettingsPanelProps) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Track site input fields
  const [newAllowedSite, setNewAllowedSite] = useState('')
  const [newBlockedSite, setNewBlockedSite] = useState('')

  // Load preferences on panel open
  useEffect(() => {
    if (!open) return
    setLoading(true)
    getPreferences(getToken)
      .then((data) => {
        setPrefs(data)
      })
      .catch(() => {
        // Use defaults on error
      })
      .finally(() => setLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply live CDC updates when panel is open
  useEffect(() => {
    if (!open || !serverPreferences) return
    setPrefs(serverPreferences)
  }, [serverPreferences, open])

  const save = useCallback(
    async (patch: Partial<UserPreferences>) => {
      // Optimistic update
      setPrefs((prev) => ({ ...prev, ...patch }))
      setSaving(true)
      try {
        const updated = await updatePreferences(patch, getToken)
        setPrefs(updated)
      } catch {
        // Revert would be complex — for now, the optimistic state stays
        // Next panel open will fetch fresh data
      } finally {
        setSaving(false)
      }
    },
    [getToken],
  )

  const addSite = (list: 'enabled_sites' | 'disabled_sites', value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const current = prefs[list]
    if (current.includes(trimmed)) return
    save({ [list]: [...current, trimmed] })
    if (list === 'enabled_sites') setNewAllowedSite('')
    else setNewBlockedSite('')
  }

  const removeSite = (
    list: 'enabled_sites' | 'disabled_sites',
    idx: number,
  ) => {
    const next = [...prefs[list]]
    next.splice(idx, 1)
    save({ [list]: next })
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-base-100 border-l border-base-300/50 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-base-300/50">
              <div className="flex items-center gap-3">
                <Settings2 size={16} className="text-primary" />
                <span className="text-xs font-bold uppercase tracking-[0.15em]">
                  Extension Settings
                </span>
              </div>
              <div className="flex items-center gap-3">
                {saving && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[9px] font-mono text-primary/60 uppercase tracking-widest"
                  >
                    Saving...
                  </motion.span>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-sm hover:bg-base-200 transition-colors text-base-content/40 hover:text-base-content/70"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-[10px] font-mono text-base-content/30 uppercase tracking-widest"
                  >
                    Loading preferences...
                  </motion.div>
                </div>
              ) : (
                <>
                  {/* ── Feed Enabled ──────────────────────── */}
                  <Section
                    icon={<Eye size={14} />}
                    title="Feed Visibility"
                    desc="Show or hide the scrollbar feed on all pages"
                  >
                    <ToggleRow
                      label={prefs.feed_enabled ? 'Enabled' : 'Disabled'}
                      active={prefs.feed_enabled}
                      onToggle={() =>
                        save({ feed_enabled: !prefs.feed_enabled })
                      }
                      activeIcon={<Eye size={12} />}
                      inactiveIcon={<EyeOff size={12} />}
                    />
                  </Section>

                  {/* ── Display Mode ─────────────────────── */}
                  <Section
                    icon={<Monitor size={14} />}
                    title="Display Mode"
                    desc="Control feed density and layout"
                  >
                    <SegmentedControl
                      value={prefs.feed_mode}
                      options={[
                        { value: 'comfort', label: 'Comfort' },
                        { value: 'compact', label: 'Compact' },
                      ]}
                      onChange={(v) =>
                        save({ feed_mode: v as 'comfort' | 'compact' })
                      }
                    />
                  </Section>

                  {/* ── Position ──────────────────────────── */}
                  <Section
                    icon={<Move size={14} />}
                    title="Position"
                    desc="Where the feed bar appears on the page"
                  >
                    <SegmentedControl
                      value={prefs.feed_position}
                      options={[
                        { value: 'bottom', label: 'Bottom' },
                        { value: 'top', label: 'Top' },
                      ]}
                      onChange={(v) =>
                        save({ feed_position: v as 'top' | 'bottom' })
                      }
                    />
                  </Section>

                  {/* ── Behavior ──────────────────────────── */}
                  <Section
                    icon={<Layers size={14} />}
                    title="Behavior"
                    desc="How the feed interacts with page content"
                  >
                    <SegmentedControl
                      value={prefs.feed_behavior}
                      options={[
                        { value: 'overlay', label: 'Overlay' },
                        { value: 'push', label: 'Push Content' },
                      ]}
                      onChange={(v) =>
                        save({ feed_behavior: v as 'overlay' | 'push' })
                      }
                    />
                  </Section>

                  {/* ── Allowed Sites ─────────────────────── */}
                  <Section
                    icon={<Globe size={14} />}
                    title="Allowed Sites"
                    desc="Only show the feed on these sites. Leave empty to show on all sites."
                  >
                    <SiteList
                      sites={prefs.enabled_sites}
                      onRemove={(i) => removeSite('enabled_sites', i)}
                      inputValue={newAllowedSite}
                      onInputChange={setNewAllowedSite}
                      onAdd={(v) => addSite('enabled_sites', v)}
                      placeholder="e.g. *.github.com"
                    />
                  </Section>

                  {/* ── Blocked Sites ─────────────────────── */}
                  <Section
                    icon={<Globe size={14} />}
                    title="Blocked Sites"
                    desc="Never show the feed on these sites"
                  >
                    <SiteList
                      sites={prefs.disabled_sites}
                      onRemove={(i) => removeSite('disabled_sites', i)}
                      inputValue={newBlockedSite}
                      onInputChange={setNewBlockedSite}
                      onAdd={(v) => addSite('disabled_sites', v)}
                      placeholder="e.g. *.youtube.com"
                    />
                  </Section>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-base-300/50">
              <p className="text-[9px] font-mono text-base-content/25 uppercase tracking-widest text-center">
                Changes sync to your extension automatically
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary">{icon}</span>
          <span className="text-xs font-bold uppercase tracking-wide">
            {title}
          </span>
        </div>
        <p className="text-[10px] text-base-content/35 uppercase tracking-wide pl-[22px]">
          {desc}
        </p>
      </div>
      <div className="pl-[22px]">{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  active,
  onToggle,
  activeIcon,
  inactiveIcon,
}: {
  label: string
  active: boolean
  onToggle: () => void
  activeIcon?: React.ReactNode
  inactiveIcon?: React.ReactNode
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-3 px-4 py-3 rounded-sm border transition-all w-full text-left ${
        active
          ? 'bg-primary/8 border-primary/20 text-primary'
          : 'bg-base-200/40 border-base-300/40 text-base-content/40'
      }`}
    >
      {active ? activeIcon : inactiveIcon}
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      <span className="ml-auto">
        <span
          className={`block h-5 w-9 rounded-full relative transition-colors ${
            active ? 'bg-primary' : 'bg-base-300'
          }`}
        >
          <motion.span
            className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white"
            animate={{ x: active ? 16 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </span>
      </span>
    </button>
  )
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 p-1 rounded-sm bg-base-200/60 border border-base-300/40">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative flex-1 px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-colors ${
            value === opt.value
              ? 'text-primary'
              : 'text-base-content/30 hover:text-base-content/50'
          }`}
        >
          {value === opt.value && (
            <motion.div
              layoutId={`seg-${options.map((o) => o.value).join('-')}`}
              className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

function SiteList({
  sites,
  onRemove,
  inputValue,
  onInputChange,
  onAdd,
  placeholder,
}: {
  sites: Array<string>
  onRemove: (idx: number) => void
  inputValue: string
  onInputChange: (v: string) => void
  onAdd: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-2">
      {sites.map((site, i) => (
        <motion.div
          key={site}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-3 py-2 rounded-sm bg-base-200/50 border border-base-300/40"
        >
          <span className="text-xs font-mono text-base-content/60 truncate">
            {site}
          </span>
          <button
            onClick={() => onRemove(i)}
            className="p-1 rounded-sm hover:bg-error/10 text-base-content/20 hover:text-error transition-colors shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </motion.div>
      ))}

      {/* Add new site input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd(inputValue)
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-sm bg-base-200/50 border border-base-300/40 text-xs font-mono text-base-content/60 placeholder:text-base-content/20 focus:outline-none focus:border-primary/30 transition-colors"
        />
        <button
          onClick={() => onAdd(inputValue)}
          className="px-3 py-2 rounded-sm border border-base-300/40 text-base-content/30 hover:text-primary hover:border-primary/30 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {sites.length === 0 && (
        <p className="text-[9px] font-mono text-base-content/20 uppercase tracking-wide">
          No sites configured
        </p>
      )}
    </div>
  )
}
