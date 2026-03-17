/**
 * Clock widget storage helpers — shared by WorldClock, ConfigPanel,
 * and the ticker data hook.
 */
import { getStore, setStore } from "../../lib/store";
import { LS_CLOCK_TIMEZONES, LS_CLOCK_FORMAT } from "../../constants";
import type { TimeFormat } from "./types";

export const DEFAULT_TIMEZONES = ["America/New_York", "Europe/London", "Asia/Tokyo"];

export function loadTimezones(): string[] {
  const tzs = getStore<string[]>(LS_CLOCK_TIMEZONES, DEFAULT_TIMEZONES);
  return Array.isArray(tzs) && tzs.length > 0 ? tzs : DEFAULT_TIMEZONES;
}

export function saveTimezones(tzs: string[]): void {
  setStore(LS_CLOCK_TIMEZONES, tzs);
}

export function loadFormat(): TimeFormat {
  const f = getStore<string>(LS_CLOCK_FORMAT, "12h");
  return f === "24h" || f === "12h" ? f : "12h";
}

export function saveFormat(f: TimeFormat): void {
  setStore(LS_CLOCK_FORMAT, f);
}

/** Extract a short display label from an IANA timezone identifier. */
export function tzLabel(tz: string): string {
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}
