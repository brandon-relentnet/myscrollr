/**
 * Clock widget types.
 */

export type ClockTab = "clocks" | "timer";
export type TimeFormat = "12h" | "24h";
export type TimerMode = "pomodoro" | "countdown" | "stopwatch";

export interface TimezoneEntry {
  tz: string;
  label: string;
  region: string;
}

export interface TimerState {
  mode: TimerMode;
  startedAt: number | null;
  bankedMs: number;
  targetSecs: number;
  completedSessions: number;
}
