import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clock } from "lucide-react";
import type { FeedTabProps } from "~/channels/types";
import type { WidgetManifest } from "../types";

// ═══════════════════════════════════════════════════════════════════
//  Combined Clock widget: World Clock + Timer under one roof.
//  Internal tab ("clocks" | "timer") persisted to localStorage.
// ═══════════════════════════════════════════════════════════════════

type ClockTab = "clocks" | "timer";

const TAB_KEY = "scrollr:widget:clock:tab";

function loadTab(): ClockTab {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    if (raw === "clocks" || raw === "timer") return raw;
  } catch { /* ignore */ }
  return "clocks";
}

function saveTab(tab: ClockTab): void {
  localStorage.setItem(TAB_KEY, tab);
}

// ═══════════════════════════════════════════════════════════════════
//  WORLD CLOCK
// ═══════════════════════════════════════════════════════════════════

// ── Timezone presets ────────────────────────────────────────────

interface TimezoneEntry { tz: string; label: string; region: string }

const TIMEZONE_PRESETS: TimezoneEntry[] = [
  // Americas
  { tz: "America/New_York", label: "New York", region: "US" },
  { tz: "America/Chicago", label: "Chicago", region: "US" },
  { tz: "America/Denver", label: "Denver", region: "US" },
  { tz: "America/Los_Angeles", label: "Los Angeles", region: "US" },
  { tz: "America/Anchorage", label: "Anchorage", region: "US" },
  { tz: "Pacific/Honolulu", label: "Honolulu", region: "US" },
  { tz: "America/Toronto", label: "Toronto", region: "Canada" },
  { tz: "America/Vancouver", label: "Vancouver", region: "Canada" },
  { tz: "America/Mexico_City", label: "Mexico City", region: "Mexico" },
  { tz: "America/Sao_Paulo", label: "Sao Paulo", region: "Brazil" },
  { tz: "America/Argentina/Buenos_Aires", label: "Buenos Aires", region: "Argentina" },
  { tz: "America/Bogota", label: "Bogota", region: "Colombia" },
  { tz: "America/Lima", label: "Lima", region: "Peru" },
  // Europe
  { tz: "Europe/London", label: "London", region: "UK" },
  { tz: "Europe/Paris", label: "Paris", region: "France" },
  { tz: "Europe/Berlin", label: "Berlin", region: "Germany" },
  { tz: "Europe/Madrid", label: "Madrid", region: "Spain" },
  { tz: "Europe/Rome", label: "Rome", region: "Italy" },
  { tz: "Europe/Amsterdam", label: "Amsterdam", region: "Netherlands" },
  { tz: "Europe/Zurich", label: "Zurich", region: "Switzerland" },
  { tz: "Europe/Stockholm", label: "Stockholm", region: "Sweden" },
  { tz: "Europe/Warsaw", label: "Warsaw", region: "Poland" },
  { tz: "Europe/Athens", label: "Athens", region: "Greece" },
  { tz: "Europe/Moscow", label: "Moscow", region: "Russia" },
  { tz: "Europe/Istanbul", label: "Istanbul", region: "Turkey" },
  // Middle East / Africa
  { tz: "Asia/Dubai", label: "Dubai", region: "UAE" },
  { tz: "Asia/Riyadh", label: "Riyadh", region: "Saudi Arabia" },
  { tz: "Africa/Cairo", label: "Cairo", region: "Egypt" },
  { tz: "Africa/Lagos", label: "Lagos", region: "Nigeria" },
  { tz: "Africa/Johannesburg", label: "Johannesburg", region: "South Africa" },
  // Asia
  { tz: "Asia/Kolkata", label: "Mumbai", region: "India" },
  { tz: "Asia/Bangkok", label: "Bangkok", region: "Thailand" },
  { tz: "Asia/Singapore", label: "Singapore", region: "Singapore" },
  { tz: "Asia/Hong_Kong", label: "Hong Kong", region: "China" },
  { tz: "Asia/Shanghai", label: "Shanghai", region: "China" },
  { tz: "Asia/Tokyo", label: "Tokyo", region: "Japan" },
  { tz: "Asia/Seoul", label: "Seoul", region: "South Korea" },
  { tz: "Asia/Jakarta", label: "Jakarta", region: "Indonesia" },
  // Oceania
  { tz: "Australia/Sydney", label: "Sydney", region: "Australia" },
  { tz: "Australia/Melbourne", label: "Melbourne", region: "Australia" },
  { tz: "Australia/Perth", label: "Perth", region: "Australia" },
  { tz: "Pacific/Auckland", label: "Auckland", region: "New Zealand" },
];

const DEFAULT_TIMEZONES = ["America/New_York", "Europe/London", "Asia/Tokyo"];

// ── Clock storage ───────────────────────────────────────────────

const TZ_KEY = "scrollr:widget:clock:timezones";
const FORMAT_KEY = "scrollr:widget:clock:format";
type TimeFormat = "12h" | "24h";

function loadTimezones(): string[] {
  try {
    const raw = localStorage.getItem(TZ_KEY);
    if (raw) { const p = JSON.parse(raw) as string[]; if (Array.isArray(p) && p.length > 0) return p; }
  } catch { /* ignore */ }
  return DEFAULT_TIMEZONES;
}
function saveTimezones(tzs: string[]): void { localStorage.setItem(TZ_KEY, JSON.stringify(tzs)); }
function loadFormat(): TimeFormat {
  try { const r = localStorage.getItem(FORMAT_KEY); if (r === "24h" || r === "12h") return r; } catch { /* ignore */ }
  return "12h";
}
function saveFormat(f: TimeFormat): void { localStorage.setItem(FORMAT_KEY, f); }

// ── Clock helpers ───────────────────────────────────────────────

function fmtTime(tz: string, fmt: TimeFormat): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: fmt === "12h", timeZone: tz }).format(new Date());
}
function fmtDate(tz: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date());
}
function getUtcOffset(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
function getLocalLabel(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ") ?? "Local"; } catch { return "Local"; }
}

// ── Close icon ──────────────────────────────────────────────────

function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ── Clock Card ──────────────────────────────────────────────────

function ClockCard({ tz, label, isLocal, compact, fmt, onRemove, animating }: {
  tz: string; label: string; isLocal: boolean; compact: boolean; fmt: TimeFormat;
  onRemove?: () => void; animating?: boolean;
}) {
  const [time, setTime] = useState(fmtTime(tz, fmt));
  const [date, setDate] = useState(fmtDate(tz));
  useEffect(() => {
    const tick = () => { setTime(fmtTime(tz, fmt)); setDate(fmtDate(tz)); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz, fmt]);
  const offset = getUtcOffset(tz);

  if (compact) {
    return (
      <div className="group flex items-center justify-between px-3 py-2 rounded-lg bg-widget-clock/[0.04] border border-widget-clock/10 hover:border-widget-clock/20 transition-all"
        style={animating ? { animation: "widget-card-enter 200ms ease-out" } : undefined}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-widget-clock/80 uppercase tracking-wider shrink-0 w-20 truncate">{label}</span>
          <span className="text-sm font-mono font-semibold text-fg tabular-nums">{time}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-fg-2">{offset}</span>
          {!isLocal && onRemove && (
            <button onClick={onRemove} className="text-fg-3 hover:text-error opacity-0 group-hover:opacity-100 transition-all" title="Remove timezone">
              <CloseIcon size={11} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={"group relative px-4 py-3 rounded-xl border transition-all " +
      (isLocal ? "bg-widget-clock/[0.06] border-widget-clock/20 shadow-[inset_0_1px_0_0_rgba(99,102,241,0.08)]" : "bg-widget-clock/[0.04] border-widget-clock/10 hover:border-widget-clock/20")}
      style={animating ? { animation: "widget-card-enter 200ms ease-out" } : undefined}>
      {!isLocal && onRemove && (
        <button onClick={onRemove} className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded text-fg-3 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all" title="Remove timezone">
          <CloseIcon size={11} />
        </button>
      )}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-widget-clock/80 uppercase tracking-wider">{label}</span>
        {isLocal && <span className="text-[10px] font-mono text-widget-clock/70 uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-widget-clock/10 border border-widget-clock/15">local</span>}
        <span className="text-[11px] font-mono text-fg-2 ml-auto">{offset}</span>
      </div>
      <div className="text-xl font-mono font-bold text-fg tabular-nums leading-none">{time}</div>
      <div className="text-xs font-mono text-fg-2 mt-1">{date}</div>
    </div>
  );
}

// ── World Clock Section ─────────────────────────────────────────

function WorldClockSection({ compact }: { compact: boolean }) {
  const [timezones, setTimezones] = useState(loadTimezones);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [fmt, setFmt] = useState<TimeFormat>(loadFormat);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => { if (showAdd && searchRef.current) searchRef.current.focus(); if (!showAdd) setSearch(""); }, [showAdd]);

  const handleRemove = useCallback((tz: string) => {
    setTimezones((p) => { const n = p.filter((t) => t !== tz); saveTimezones(n); return n; });
  }, []);
  const handleAdd = useCallback((tz: string) => {
    setTimezones((p) => { if (p.includes(tz)) return p; const n = [...p, tz]; saveTimezones(n); return n; });
    setRecentlyAdded((p) => new Set(p).add(tz));
    setTimeout(() => { setRecentlyAdded((p) => { const n = new Set(p); n.delete(tz); return n; }); }, 300);
    setSearch("");
  }, []);
  const toggleFormat = useCallback(() => { setFmt((p) => { const n = p === "12h" ? "24h" : "12h"; saveFormat(n); return n; }); }, []);

  const allZones = [localTz, ...timezones.filter((tz) => tz !== localTz)];
  const available = useMemo(() => {
    const added = new Set(allZones);
    const filtered = TIMEZONE_PRESETS.filter((p) => !added.has(p.tz));
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter((p) => p.label.toLowerCase().includes(q) || p.region.toLowerCase().includes(q) || p.tz.toLowerCase().includes(q));
  }, [allZones, search]);

  return (
    <>
      {/* Controls */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2">
          <button onClick={toggleFormat}
            className="text-xs font-mono px-1.5 py-0.5 rounded border transition-colors text-widget-clock/70 border-widget-clock/20 hover:text-widget-clock hover:border-widget-clock/30"
            title={fmt === "12h" ? "Switch to 24-hour format" : "Switch to 12-hour format"}>
            {fmt === "12h" ? "12h" : "24h"}
          </button>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className={"text-xs font-mono transition-colors " + (showAdd ? "text-widget-clock" : "text-widget-clock/70 hover:text-widget-clock")}>
          {showAdd ? "Done" : "+ Add"}
        </button>
      </div>

      {/* Add timezone picker */}
      {showAdd && (
        <div className="rounded-lg border border-widget-clock/15 bg-surface-2 overflow-hidden" style={{ animation: "widget-card-enter 150ms ease-out" }}>
          <div className="px-3 py-2 border-b border-edge/50">
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cities..." className="w-full bg-transparent text-xs font-mono text-fg placeholder:text-fg-3 outline-none" />
          </div>
          <div className="max-h-44 overflow-y-auto scrollbar-thin">
            {available.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs font-mono text-fg-3">{search ? "No matching cities" : "All timezones added"}</div>
            ) : available.map((preset) => (
              <button key={preset.tz} onClick={() => handleAdd(preset.tz)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-widget-clock/[0.06] transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-fg">{preset.label}</span>
                  <span className="text-[11px] font-mono text-fg-2 truncate">{preset.region}</span>
                </div>
                <span className="text-[11px] font-mono text-fg-2 shrink-0 ml-2">{getUtcOffset(preset.tz)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clock cards */}
      <div className={compact ? "space-y-1" : "grid gap-2"}>
        {allZones.map((tz) => {
          const isLocal = tz === localTz;
          const preset = TIMEZONE_PRESETS.find((p) => p.tz === tz);
          const label = isLocal ? getLocalLabel() : preset?.label ?? tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
          return <ClockCard key={tz} tz={tz} label={label} isLocal={isLocal} compact={compact} fmt={fmt}
            onRemove={isLocal ? undefined : () => handleRemove(tz)} animating={recentlyAdded.has(tz)} />;
        })}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════════════════════

type TimerMode = "pomodoro" | "countdown" | "stopwatch";
interface TimerState {
  mode: TimerMode;
  startedAt: number | null;
  bankedMs: number;
  targetSecs: number;
  completedSessions: number;
}

const POMODORO_WORK = 25 * 60;
const POMODORO_SHORT_BREAK = 5 * 60;
const POMODORO_LONG_BREAK = 15 * 60;
const COUNTDOWN_PRESETS = [
  { label: "1m", secs: 60 }, { label: "5m", secs: 300 }, { label: "10m", secs: 600 },
  { label: "15m", secs: 900 }, { label: "30m", secs: 1800 }, { label: "60m", secs: 3600 },
];

const TIMER_KEY = "scrollr:widget:timer:state";
function loadTimerState(): TimerState {
  try { const r = localStorage.getItem(TIMER_KEY); if (r) { const p = JSON.parse(r) as TimerState; if (p && typeof p.mode === "string") return p; } } catch { /* ignore */ }
  return { mode: "pomodoro", startedAt: null, bankedMs: 0, targetSecs: POMODORO_WORK, completedSessions: 0 };
}
function saveTimerState(s: TimerState): void { localStorage.setItem(TIMER_KEY, JSON.stringify(s)); }

function getElapsedMs(s: TimerState): number { return s.startedAt === null ? s.bankedMs : s.bankedMs + (Date.now() - s.startedAt); }
function fmtDuration(t: number): string {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function playCompletionTone(): void {
  try {
    const ctx = new AudioContext(); const now = ctx.currentTime;
    [520, 780].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.5);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch { /* Web Audio not available */ }
}

// ── Circular Progress ───────────────────────────────────────────

function CircularProgress({ progress, size, strokeWidth, running, children }: {
  progress: number; size: number; strokeWidth: number; running: boolean; children: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2, c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-widget-timer/10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} className="text-widget-timer transition-[stroke-dashoffset] duration-300"
          style={running ? { filter: "drop-shadow(0 0 4px rgba(245, 158, 11, 0.4))" } : undefined} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ── Timer Mode Tabs (stable identity — extracted) ───────────────

function TimerModeTabs({ activeMode, size, onSwitch }: { activeMode: TimerMode; size: "sm" | "md"; onSwitch: (m: TimerMode) => void }) {
  const cls = size === "sm" ? "text-[11px] px-2 py-0.5 rounded" : "text-xs px-3 py-1.5 rounded-lg";
  return (
    <div className="flex items-center justify-center gap-1">
      {(["pomodoro", "countdown", "stopwatch"] as TimerMode[]).map((m) => (
        <button key={m} onClick={() => onSwitch(m)}
          className={`font-mono uppercase tracking-wider transition-colors ${cls} ${activeMode === m
            ? "text-widget-timer bg-widget-timer/10 border border-widget-timer/25"
            : "text-fg-2 hover:text-fg border border-transparent hover:border-edge"}`}>
          {m === "pomodoro" ? (size === "sm" ? "Pomo" : "Pomodoro") : m === "countdown" ? (size === "sm" ? "Count" : "Countdown") : (size === "sm" ? "Stop" : "Stopwatch")}
        </button>
      ))}
    </div>
  );
}

// ── Confirm Dialog (stable identity — extracted) ────────────────

function TimerConfirmDialog({ targetMode, isRunning, onCancel, onConfirm }: {
  targetMode: TimerMode | null; isRunning: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  if (!targetMode) return null;
  const name = targetMode === "pomodoro" ? "Pomodoro" : targetMode === "countdown" ? "Countdown" : "Stopwatch";
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 backdrop-blur-sm rounded-xl"
      style={{ animation: "widget-card-enter 150ms ease-out" }}>
      <div className="text-center space-y-3 px-4">
        <p className="text-[13px] font-mono text-fg">Timer is {isRunning ? "running" : "paused"}.</p>
        <p className="text-xs font-mono text-fg-2">Switch to {name} and reset?</p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={onCancel} className="text-xs font-mono text-fg-2 px-3 py-1.5 rounded-lg border border-edge hover:text-fg hover:border-edge-2 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="text-xs font-mono font-semibold text-widget-timer px-3 py-1.5 rounded-lg bg-widget-timer/10 border border-widget-timer/25 hover:bg-widget-timer/15 transition-colors">Switch</button>
        </div>
      </div>
    </div>
  );
}

// ── Timer Section ───────────────────────────────────────────────

function TimerSection({ compact }: { compact: boolean }) {
  const [state, setState] = useState(loadTimerState);
  const [, setTick] = useState(0);
  const [confirmSwitch, setConfirmSwitch] = useState<TimerMode | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveTimerState(state); }, [state]);

  useEffect(() => {
    if (state.startedAt !== null) {
      tickRef.current = setInterval(() => {
        setTick((t) => t + 1);
        const s = stateRef.current;
        if (s.mode !== "stopwatch" && s.startedAt !== null) {
          if (getElapsedMs(s) >= s.targetSecs * 1000) {
            setState((p) => ({ ...p, startedAt: null, bankedMs: p.targetSecs * 1000,
              completedSessions: p.mode === "pomodoro" ? p.completedSessions + 1 : p.completedSessions }));
            playCompletionTone();
            if ("Notification" in globalThis && Notification.permission === "granted") {
              const title = s.mode === "pomodoro" ? "Pomodoro Complete!" : "Timer Done!";
              new Notification(title, { body: s.mode === "pomodoro" ? "Time for a break." : `${fmtDuration(s.targetSecs)} elapsed.`, silent: false });
            }
          }
        }
      }, 200);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state.startedAt]);

  useEffect(() => { if (showCustom && customInputRef.current) customInputRef.current.focus(); }, [showCustom]);

  const elapsedMs = getElapsedMs(state);
  const elapsedSecs = elapsedMs / 1000;
  const isRunning = state.startedAt !== null;
  const isCountdown = state.mode === "pomodoro" || state.mode === "countdown";
  const remainingSecs = isCountdown ? Math.max(0, state.targetSecs - elapsedSecs) : elapsedSecs;
  const progress = isCountdown ? (state.targetSecs > 0 ? elapsedSecs / state.targetSecs : 0) : 0;
  const isComplete = isCountdown && elapsedMs >= state.targetSecs * 1000;
  const displayTime = isCountdown ? fmtDuration(remainingSecs) : fmtDuration(elapsedSecs);

  const start = useCallback(() => { setState((p) => ({ ...p, startedAt: Date.now() })); }, []);
  const pause = useCallback(() => { setState((p) => ({ ...p, startedAt: null, bankedMs: getElapsedMs(p) })); }, []);
  const reset = useCallback(() => { setState((p) => ({ ...p, startedAt: null, bankedMs: 0 })); }, []);

  const requestSwitchMode = useCallback((m: TimerMode) => {
    if (m === stateRef.current.mode) return;
    if (stateRef.current.startedAt !== null || stateRef.current.bankedMs > 0) setConfirmSwitch(m);
    else doSwitchMode(m);
  }, []);
  const doSwitchMode = useCallback((m: TimerMode) => {
    setState((p) => ({ ...p, mode: m, startedAt: null, bankedMs: 0, targetSecs: m === "pomodoro" ? POMODORO_WORK : m === "countdown" ? 300 : 0 }));
    setConfirmSwitch(null); setShowCustom(false); setCustomMinutes("");
  }, []);
  const setTarget = useCallback((secs: number) => { setState((p) => ({ ...p, startedAt: null, bankedMs: 0, targetSecs: secs })); setShowCustom(false); setCustomMinutes(""); }, []);
  const handleCustomSubmit = useCallback(() => { const m = parseFloat(customMinutes); if (m > 0 && m <= 600) setTarget(Math.round(m * 60)); }, [customMinutes, setTarget]);
  const startBreak = useCallback((long: boolean) => { setState((p) => ({ ...p, startedAt: Date.now(), bankedMs: 0, targetSecs: long ? POMODORO_LONG_BREAK : POMODORO_SHORT_BREAK })); }, []);
  const requestNotificationPermission = useCallback(async () => { if ("Notification" in globalThis) { await Notification.requestPermission(); setTick((t) => t + 1); } }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (confirmSwitch) return;
      if (e.key === " ") { e.preventDefault(); if (isComplete) reset(); else if (isRunning) pause(); else start(); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); reset(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRunning, isComplete, start, pause, reset, confirmSwitch]);

  const notifPermission = "Notification" in globalThis ? Notification.permission : "denied";

  // ── Compact timer ───────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-2 relative">
        <TimerConfirmDialog targetMode={confirmSwitch} isRunning={isRunning}
          onCancel={() => setConfirmSwitch(null)} onConfirm={() => { if (confirmSwitch) doSwitchMode(confirmSwitch); }} />
        <TimerModeTabs activeMode={state.mode} size="sm" onSwitch={requestSwitchMode} />
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-widget-timer/[0.04] border border-widget-timer/10">
          <div className="flex items-center gap-2">
            {isRunning && <div className="w-1.5 h-1.5 rounded-full bg-widget-timer" style={{ animation: "widget-pulse 1.5s ease-in-out infinite" }} />}
            <span className={`text-lg font-mono font-bold tabular-nums ${isComplete ? "text-widget-timer" : "text-fg"}`}>{displayTime}</span>
          </div>
          <div className="flex gap-1">
            {isComplete ? <button onClick={reset} className="text-xs font-mono text-widget-timer hover:text-widget-timer/80 px-2 py-1 rounded bg-widget-timer/10 transition-colors">Reset</button>
              : isRunning ? <button onClick={pause} className="text-xs font-mono text-widget-timer hover:text-widget-timer/80 px-2 py-1 rounded bg-widget-timer/10 transition-colors">Pause</button>
              : <><button onClick={start} className="text-xs font-mono text-widget-timer hover:text-widget-timer/80 px-2 py-1 rounded bg-widget-timer/10 transition-colors">{state.bankedMs > 0 ? "Resume" : "Start"}</button>
                {state.bankedMs > 0 && <button onClick={reset} className="text-xs font-mono text-fg-2 hover:text-fg px-2 py-1 rounded transition-colors">Reset</button>}</>}
          </div>
        </div>
      </div>
    );
  }

  // ── Comfort timer ───────────────────────────────────────────
  return (
    <div className="space-y-4 relative">
      <TimerConfirmDialog targetMode={confirmSwitch} isRunning={isRunning}
        onCancel={() => setConfirmSwitch(null)} onConfirm={() => { if (confirmSwitch) doSwitchMode(confirmSwitch); }} />

      <TimerModeTabs activeMode={state.mode} size="md" onSwitch={requestSwitchMode} />

      {/* Display */}
      <div className="flex flex-col items-center">
        {isCountdown ? (
          <CircularProgress progress={progress} size={160} strokeWidth={4} running={isRunning}>
            <span className={`text-2xl font-mono font-bold tabular-nums ${isComplete ? "text-widget-timer" : "text-fg"}`}>{displayTime}</span>
            {state.mode === "pomodoro" && <span className="text-[11px] font-mono text-fg-2 mt-1">Session {state.completedSessions + 1}</span>}
          </CircularProgress>
        ) : (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-2">
              {isRunning && <div className="w-2 h-2 rounded-full bg-widget-timer" style={{ animation: "widget-pulse 1.5s ease-in-out infinite" }} />}
              <span className="text-3xl font-mono font-bold text-fg tabular-nums">{displayTime}</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {isComplete ? (
          <>
            <button onClick={reset} className="text-xs font-mono font-semibold text-widget-timer px-5 py-2 rounded-full bg-widget-timer/10 border border-widget-timer/25 hover:bg-widget-timer/15 transition-colors">Reset</button>
            {state.mode === "pomodoro" && (
              <>
                <button onClick={() => startBreak(false)} className="text-xs font-mono text-fg px-4 py-2 rounded-full bg-surface-2 border border-edge hover:border-edge-2 transition-colors">Short Break</button>
                {state.completedSessions > 0 && state.completedSessions % 4 === 0 && (
                  <button onClick={() => startBreak(true)} className="text-xs font-mono text-fg px-4 py-2 rounded-full bg-surface-2 border border-edge hover:border-edge-2 transition-colors">Long Break</button>
                )}
              </>
            )}
          </>
        ) : isRunning ? (
          <button onClick={pause} className="text-xs font-mono font-semibold text-widget-timer px-5 py-2 rounded-full bg-widget-timer/10 border border-widget-timer/25 hover:bg-widget-timer/15 transition-colors">Pause</button>
        ) : (
          <>
            <button onClick={start} className="text-xs font-mono font-semibold text-widget-timer px-5 py-2 rounded-full bg-widget-timer/10 border border-widget-timer/25 hover:bg-widget-timer/15 transition-colors">{state.bankedMs > 0 ? "Resume" : "Start"}</button>
            {state.bankedMs > 0 && <button onClick={reset} className="text-xs font-mono text-fg-2 px-4 py-2 rounded-full hover:text-fg hover:bg-surface-2 transition-colors">Reset</button>}
          </>
        )}
      </div>

      {/* Countdown presets */}
      {state.mode === "countdown" && !isRunning && state.bankedMs === 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {COUNTDOWN_PRESETS.map((p) => (
              <button key={p.secs} onClick={() => setTarget(p.secs)}
                className={`text-xs font-mono px-2.5 py-1 rounded-full transition-colors ${state.targetSecs === p.secs && !showCustom
                  ? "text-widget-timer bg-widget-timer/10 border border-widget-timer/25" : "text-fg-2 border border-edge hover:text-fg hover:border-edge-2"}`}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setShowCustom((v) => !v)}
              className={`text-xs font-mono px-2.5 py-1 rounded-full transition-colors ${showCustom
                ? "text-widget-timer bg-widget-timer/10 border border-widget-timer/25" : "text-fg-2 border border-edge hover:text-fg hover:border-edge-2"}`}>
              Custom
            </button>
          </div>
          {showCustom && (
            <div className="flex items-center justify-center gap-2" style={{ animation: "widget-card-enter 150ms ease-out" }}>
              <input ref={customInputRef} type="number" min="0.5" max="600" step="0.5" value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCustomSubmit(); }}
                placeholder="Minutes" className="w-20 text-center text-xs font-mono bg-surface-2 border border-edge rounded-lg px-2 py-1.5 text-fg placeholder:text-fg-3 outline-none focus:border-widget-timer/30 transition-colors" />
              <button onClick={handleCustomSubmit} disabled={!customMinutes || parseFloat(customMinutes) <= 0}
                className="text-xs font-mono font-semibold text-widget-timer px-3 py-1.5 rounded-lg bg-widget-timer/10 border border-widget-timer/25 hover:bg-widget-timer/15 transition-colors disabled:opacity-30 disabled:cursor-default">Set</button>
            </div>
          )}
        </div>
      )}

      {state.mode === "pomodoro" && state.completedSessions > 0 && (
        <div className="text-center"><span className="text-[11px] font-mono text-fg-2">{state.completedSessions} session{state.completedSessions !== 1 ? "s" : ""} completed</span></div>
      )}

      {notifPermission === "default" && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-widget-timer/[0.04] border border-widget-timer/10" style={{ animation: "widget-card-enter 200ms ease-out" }}>
          <span className="text-[11px] font-mono text-fg-2">Enable notifications for timer alerts?</span>
          <button onClick={requestNotificationPermission} className="text-[11px] font-mono font-semibold text-widget-timer hover:text-widget-timer/80 transition-colors">Allow</button>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 pt-1">
        <span className="text-[10px] font-mono text-fg-3"><kbd className="px-1 py-0.5 rounded bg-surface-2 border border-edge text-fg-2">Space</kbd> start/pause</span>
        <span className="text-[10px] font-mono text-fg-3"><kbd className="px-1 py-0.5 rounded bg-surface-2 border border-edge text-fg-2">R</kbd> reset</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  COMBINED FEED TAB
// ═══════════════════════════════════════════════════════════════════

function ClockFeedTab({ mode }: FeedTabProps) {
  const compact = mode === "compact";
  const [activeTab, setActiveTab] = useState<ClockTab>(loadTab);

  const switchTab = useCallback((tab: ClockTab) => {
    setActiveTab(tab);
    saveTab(tab);
  }, []);

  return (
    <div className="p-3 space-y-2">
      {/* Top-level tabs: Clocks | Timer */}
      <div className="flex items-center gap-1 px-1">
        {(["clocks", "timer"] as ClockTab[]).map((tab) => (
          <button key={tab} onClick={() => switchTab(tab)}
            className={`text-xs font-mono font-semibold uppercase tracking-wider px-3 py-1 rounded-lg transition-colors ${
              activeTab === tab
                ? (tab === "clocks"
                    ? "text-widget-clock bg-widget-clock/10 border border-widget-clock/20"
                    : "text-widget-timer bg-widget-timer/10 border border-widget-timer/20")
                : "text-fg-2 hover:text-fg border border-transparent hover:border-edge"
            }`}>
            {tab === "clocks" ? "Clocks" : "Timer"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "clocks" ? (
        <WorldClockSection compact={compact} />
      ) : (
        <TimerSection compact={compact} />
      )}
    </div>
  );
}

// ── Manifest ────────────────────────────────────────────────────

export const clockWidget: WidgetManifest = {
  id: "clock",
  name: "Clock",
  tabLabel: "Clock",
  description: "Local time, world clocks, and timers",
  hex: "#6366f1",
  icon: Clock,
  info: {
    about:
      "The Clock widget displays your local time on the ticker and provides world clocks for tracking multiple time zones. It also includes a countdown and stopwatch timer.",
    usage: [
      "Your local time appears on the ticker by default.",
      "Enable world clocks in the Configuration tab to add additional time zones.",
      "Use the timer tab in the feed view to set countdowns or run a stopwatch.",
      "Exclude specific time zones from the ticker in the Configuration tab.",
    ],
  },
  FeedTab: ClockFeedTab,
};

export default ClockFeedTab;
