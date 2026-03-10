import { useState, useEffect, useCallback, useRef } from "react";
import type { FeedTabProps } from "~/channels/types";
import type { WidgetManifest } from "../types";

// ── Types ───────────────────────────────────────────────────────

type TimerMode = "pomodoro" | "countdown" | "stopwatch";

interface TimerState {
  mode: TimerMode;
  /** Absolute timestamp (ms) when the timer was started/resumed. null = paused/stopped. */
  startedAt: number | null;
  /** Accumulated elapsed time (ms) before the current run (for pause/resume). */
  bankedMs: number;
  /** Target duration in seconds (for pomodoro/countdown). */
  targetSecs: number;
  /** Number of completed pomodoro sessions. */
  completedSessions: number;
}

// ── Pomodoro presets ────────────────────────────────────────────

const POMODORO_WORK = 25 * 60;
const POMODORO_SHORT_BREAK = 5 * 60;
const POMODORO_LONG_BREAK = 15 * 60;

const COUNTDOWN_PRESETS = [
  { label: "1m", secs: 60 },
  { label: "5m", secs: 300 },
  { label: "10m", secs: 600 },
  { label: "15m", secs: 900 },
  { label: "30m", secs: 1800 },
  { label: "60m", secs: 3600 },
];

// ── Storage ─────────────────────────────────────────────────────

const STORAGE_KEY = "scrollr:widget:timer:state";

function loadState(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TimerState;
      if (parsed && typeof parsed.mode === "string") return parsed;
    }
  } catch {
    // ignore
  }
  return {
    mode: "pomodoro",
    startedAt: null,
    bankedMs: 0,
    targetSecs: POMODORO_WORK,
    completedSessions: 0,
  };
}

function saveState(state: TimerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Helpers ─────────────────────────────────────────────────────

function getElapsedMs(state: TimerState): number {
  if (state.startedAt === null) return state.bankedMs;
  return state.bankedMs + (Date.now() - state.startedAt);
}

function formatDuration(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Circular Progress ───────────────────────────────────────────

function CircularProgress({
  progress,
  size,
  strokeWidth,
  children,
}: {
  progress: number;
  size: number;
  strokeWidth: number;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-widget-timer/10"
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-widget-timer transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ── FeedTab Component ───────────────────────────────────────────

function TimerFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";
  const [state, setState] = useState(loadState);
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Tick loop — only runs while timer is active
  useEffect(() => {
    if (state.startedAt !== null) {
      tickRef.current = setInterval(() => {
        setTick((t) => t + 1);

        // Auto-complete for pomodoro/countdown
        const s = stateRef.current;
        if (s.mode !== "stopwatch" && s.startedAt !== null) {
          const elapsed = getElapsedMs(s);
          if (elapsed >= s.targetSecs * 1000) {
            // Timer complete
            setState((prev) => ({
              ...prev,
              startedAt: null,
              bankedMs: prev.targetSecs * 1000,
              completedSessions:
                prev.mode === "pomodoro"
                  ? prev.completedSessions + 1
                  : prev.completedSessions,
            }));

            // Notification
            if ("Notification" in globalThis && Notification.permission === "granted") {
              const title =
                s.mode === "pomodoro" ? "Pomodoro Complete!" : "Timer Done!";
              new Notification(title, {
                body:
                  s.mode === "pomodoro"
                    ? "Time for a break."
                    : `${formatDuration(s.targetSecs)} elapsed.`,
                silent: false,
              });
            }
          }
        }
      }, 200);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state.startedAt]);

  // Derived values
  const elapsedMs = getElapsedMs(state);
  const elapsedSecs = elapsedMs / 1000;
  const isRunning = state.startedAt !== null;
  const isCountdown = state.mode === "pomodoro" || state.mode === "countdown";
  const remainingSecs = isCountdown
    ? Math.max(0, state.targetSecs - elapsedSecs)
    : elapsedSecs;
  const progress = isCountdown
    ? state.targetSecs > 0
      ? elapsedSecs / state.targetSecs
      : 0
    : 0;
  const isComplete = isCountdown && elapsedMs >= state.targetSecs * 1000;
  const displayTime = isCountdown
    ? formatDuration(remainingSecs)
    : formatDuration(elapsedSecs);

  // Actions
  const start = useCallback(() => {
    setState((prev) => ({
      ...prev,
      startedAt: Date.now(),
    }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({
      ...prev,
      startedAt: null,
      bankedMs: getElapsedMs(prev),
    }));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      startedAt: null,
      bankedMs: 0,
    }));
  }, []);

  const switchMode = useCallback((newMode: TimerMode) => {
    const target =
      newMode === "pomodoro"
        ? POMODORO_WORK
        : newMode === "countdown"
          ? 300
          : 0;
    setState((prev) => ({
      ...prev,
      mode: newMode,
      startedAt: null,
      bankedMs: 0,
      targetSecs: target,
    }));
  }, []);

  const setTarget = useCallback((secs: number) => {
    setState((prev) => ({
      ...prev,
      startedAt: null,
      bankedMs: 0,
      targetSecs: secs,
    }));
  }, []);

  const startBreak = useCallback((long: boolean) => {
    setState((prev) => ({
      ...prev,
      startedAt: Date.now(),
      bankedMs: 0,
      targetSecs: long ? POMODORO_LONG_BREAK : POMODORO_SHORT_BREAK,
    }));
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isComplete) reset();
          else if (isRunning) pause();
          else start();
          break;
        case "r":
        case "R":
          e.preventDefault();
          reset();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRunning, isComplete, start, pause, reset]);

  // ── Compact render ──────────────────────────────────────────
  if (compact) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex gap-1">
            {(["pomodoro", "countdown", "stopwatch"] as TimerMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                  state.mode === m
                    ? "text-widget-timer bg-widget-timer/10"
                    : "text-fg-3 hover:text-fg-2"
                }`}
              >
                {m === "pomodoro" ? "Pomo" : m === "countdown" ? "Count" : "Stop"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-widget-timer/[0.04] border border-widget-timer/10">
          <span className={`text-lg font-mono font-bold tabular-nums ${isComplete ? "text-widget-timer animate-pulse" : "text-fg"}`}>
            {displayTime}
          </span>
          <div className="flex gap-1">
            {isComplete ? (
              <button onClick={reset} className="text-[10px] font-mono text-widget-timer hover:text-widget-timer/80 px-2 py-1 rounded bg-widget-timer/10">
                Reset
              </button>
            ) : isRunning ? (
              <button onClick={pause} className="text-[10px] font-mono text-widget-timer hover:text-widget-timer/80 px-2 py-1 rounded bg-widget-timer/10">
                Pause
              </button>
            ) : (
              <>
                <button onClick={start} className="text-[10px] font-mono text-widget-timer hover:text-widget-timer/80 px-2 py-1 rounded bg-widget-timer/10">
                  {state.bankedMs > 0 ? "Resume" : "Start"}
                </button>
                {state.bankedMs > 0 && (
                  <button onClick={reset} className="text-[10px] font-mono text-fg-3 hover:text-fg-2 px-2 py-1 rounded">
                    Reset
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Comfort render ──────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Mode tabs */}
      <div className="flex items-center justify-center gap-1">
        {(["pomodoro", "countdown", "stopwatch"] as TimerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`text-[10px] font-mono uppercase tracking-wider px-3 py-1 rounded-lg transition-colors ${
              state.mode === m
                ? "text-widget-timer bg-widget-timer/10 border border-widget-timer/20"
                : "text-fg-3 hover:text-fg-2 border border-transparent"
            }`}
          >
            {m === "pomodoro" ? "Pomodoro" : m === "countdown" ? "Countdown" : "Stopwatch"}
          </button>
        ))}
      </div>

      {/* Timer display */}
      <div className="flex flex-col items-center">
        {isCountdown ? (
          <CircularProgress
            progress={progress}
            size={compact ? 120 : 160}
            strokeWidth={4}
          >
            <span className={`text-2xl font-mono font-bold tabular-nums ${isComplete ? "text-widget-timer" : "text-fg"}`}>
              {displayTime}
            </span>
            {state.mode === "pomodoro" && (
              <span className="text-[9px] font-mono text-fg-3 mt-1">
                Session {state.completedSessions + 1}
              </span>
            )}
          </CircularProgress>
        ) : (
          <div className="text-center py-4">
            <span className="text-3xl font-mono font-bold text-fg tabular-nums">
              {displayTime}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {isComplete ? (
          <>
            <button
              onClick={reset}
              className="text-[10px] font-mono font-semibold text-widget-timer px-4 py-2 rounded-lg bg-widget-timer/10 border border-widget-timer/20 hover:bg-widget-timer/15 transition-colors"
            >
              Reset
            </button>
            {state.mode === "pomodoro" && (
              <>
                <button
                  onClick={() => startBreak(false)}
                  className="text-[10px] font-mono text-fg-2 px-3 py-2 rounded-lg bg-surface-2 border border-edge hover:border-edge-2 transition-colors"
                >
                  Short Break
                </button>
                {state.completedSessions > 0 && state.completedSessions % 4 === 0 && (
                  <button
                    onClick={() => startBreak(true)}
                    className="text-[10px] font-mono text-fg-2 px-3 py-2 rounded-lg bg-surface-2 border border-edge hover:border-edge-2 transition-colors"
                  >
                    Long Break
                  </button>
                )}
              </>
            )}
          </>
        ) : isRunning ? (
          <button
            onClick={pause}
            className="text-[10px] font-mono font-semibold text-widget-timer px-4 py-2 rounded-lg bg-widget-timer/10 border border-widget-timer/20 hover:bg-widget-timer/15 transition-colors"
          >
            Pause
          </button>
        ) : (
          <>
            <button
              onClick={start}
              className="text-[10px] font-mono font-semibold text-widget-timer px-4 py-2 rounded-lg bg-widget-timer/10 border border-widget-timer/20 hover:bg-widget-timer/15 transition-colors"
            >
              {state.bankedMs > 0 ? "Resume" : "Start"}
            </button>
            {state.bankedMs > 0 && (
              <button
                onClick={reset}
                className="text-[10px] font-mono text-fg-3 px-3 py-2 rounded-lg hover:text-fg-2 transition-colors"
              >
                Reset
              </button>
            )}
          </>
        )}
      </div>

      {/* Countdown presets (only in countdown mode when not running) */}
      {state.mode === "countdown" && !isRunning && state.bankedMs === 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {COUNTDOWN_PRESETS.map((p) => (
            <button
              key={p.secs}
              onClick={() => setTarget(p.secs)}
              className={`text-[9px] font-mono px-2 py-1 rounded transition-colors ${
                state.targetSecs === p.secs
                  ? "text-widget-timer bg-widget-timer/10 border border-widget-timer/20"
                  : "text-fg-3 border border-edge hover:text-fg-2 hover:border-edge-2"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Pomodoro session count */}
      {state.mode === "pomodoro" && state.completedSessions > 0 && (
        <div className="text-center">
          <span className="text-[9px] font-mono text-fg-3">
            {state.completedSessions} session{state.completedSessions !== 1 ? "s" : ""} completed
          </span>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <span className="text-[8px] font-mono text-fg-4">
          <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-edge text-fg-3">Space</kbd>
          {" "}start/pause
        </span>
        <span className="text-[8px] font-mono text-fg-4">
          <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-edge text-fg-3">R</kbd>
          {" "}reset
        </span>
      </div>
    </div>
  );
}

// ── Manifest ────────────────────────────────────────────────────

export const timerWidget: WidgetManifest = {
  id: "timer",
  name: "Timer",
  tabLabel: "Timer",
  hex: "#f59e0b",
  FeedTab: TimerFeedTab,
};

export default TimerFeedTab;
