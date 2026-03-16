/**
 * Shared store keys and constants.
 *
 * Centralizes all widget-related storage keys so they're defined once
 * and imported everywhere — no magic strings scattered across files.
 */

// ── Widget store keys ───────────────────────────────────────────

export const LS_CLOCK_TIMEZONES = "scrollr:widget:clock:timezones";
export const LS_CLOCK_FORMAT = "scrollr:widget:clock:format";
export const LS_TIMER_STATE = "scrollr:widget:timer:state";
export const LS_WEATHER_CITIES = "scrollr:widget:weather:cities";
export const LS_WEATHER_UNIT = "scrollr:widget:weather:unit";
export const LS_UPTIME_MONITORS = "scrollr:widget:uptime:monitors";
export const LS_GITHUB_REPOS = "scrollr:widget:github:repos";

// ── Widget pin options ──────────────────────────────────────────

import type { PinSide } from "./preferences";

export const PIN_SIDE_OPTIONS: { value: PinSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];
