/**
 * ThemeSwatchPicker — visual palette picker for the Appearance card.
 *
 * Replaces a 10-entry SelectRow with a 5×2 swatch grid. Each swatch
 * is a small tile showing the theme's dark-variant surface, accent,
 * and foreground colors so the user can see what they're choosing at
 * a glance. Names are kept below the tile so screen readers and
 * less-visual users still get the label.
 *
 * The swatch is the only intentional break from the standard row
 * layout used elsewhere on the settings pages. Every other control
 * sticks to the SettingsControls primitives.
 *
 * Why a static color map instead of reading CSS variables?
 * Each swatch must render in its OWN theme, not the currently active
 * one. We can't grab `--color-surface` from CSS because all swatches
 * would inherit the active palette. The colors are duplicated here
 * from style.css but the surface area is small (one accent + one
 * surface + one fg per theme, dark variant only).
 */
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import type { ThemeFamily } from "../../preferences";
import { THEME_FAMILY_LABELS } from "../../preferences";
import Tooltip from "../Tooltip";

// ── Swatch colors (dark variant) ────────────────────────────────
//
// Sourced from desktop/src/style.css. Kept dark-only because:
//   - Scrollr ships dark-by-default and most themes are dark-first.
//   - A single visual treatment per theme avoids the swatch flipping
//     identity when the user changes color mode.
// If a theme changes its palette, update both this map and the CSS.

interface ThemeSwatch {
  surface: string; // base background
  surface2: string; // subtle inner ring (mantle / sidebar)
  accent: string; // primary accent dot
  fg: string; // foreground bar
}

const THEME_SWATCHES: Record<ThemeFamily, ThemeSwatch> = {
  scrollr: {
    surface: "#141420",
    surface2: "#1c1c2a",
    accent: "#34d399",
    fg: "#e2e2ec",
  },
  catppuccin: {
    surface: "#1e1e2e",
    surface2: "#181825",
    accent: "#a6e3a1",
    fg: "#cdd6f4",
  },
  dracula: {
    surface: "#282a36",
    surface2: "#21222c",
    accent: "#50fa7b",
    fg: "#f8f8f2",
  },
  "tokyo-night": {
    surface: "#1a1b26",
    surface2: "#16161e",
    accent: "#7aa2f7",
    fg: "#c0caf5",
  },
  nord: {
    surface: "#2e3440",
    surface2: "#292e39",
    accent: "#88c0d0",
    fg: "#eceff4",
  },
  gruvbox: {
    surface: "#282828",
    surface2: "#1d2021",
    accent: "#b8bb26",
    fg: "#ebdbb2",
  },
  solarized: {
    surface: "#002b36",
    surface2: "#073642",
    accent: "#2aa198",
    fg: "#93a1a1",
  },
  "rose-pine": {
    surface: "#191724",
    surface2: "#1f1d2e",
    accent: "#c4a7e7",
    fg: "#e0def4",
  },
  one: {
    surface: "#282c34",
    surface2: "#21252b",
    accent: "#61afef",
    fg: "#abb2bf",
  },
  everforest: {
    surface: "#2d353b",
    surface2: "#232a2e",
    accent: "#a7c080",
    fg: "#d3c6aa",
  },
};

// Canonical render order. Scrollr is first since it's the default;
// other themes follow in the order they were added to style.css so
// the visual layout stays stable.
const SWATCH_ORDER: ThemeFamily[] = [
  "scrollr",
  "catppuccin",
  "dracula",
  "tokyo-night",
  "nord",
  "gruvbox",
  "solarized",
  "rose-pine",
  "one",
  "everforest",
];

// ── Component ───────────────────────────────────────────────────

interface ThemeSwatchPickerProps {
  value: ThemeFamily;
  onChange: (family: ThemeFamily) => void;
}

export default function ThemeSwatchPicker({
  value,
  onChange,
}: ThemeSwatchPickerProps) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ui-muted leading-tight">Theme</span>
        <span className="text-ui-meta text-fg-3">
          {THEME_FAMILY_LABELS[value]}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Theme palette"
        className="grid grid-cols-5 gap-1.5"
      >
        {SWATCH_ORDER.map((family) => (
          <Swatch
            key={family}
            family={family}
            isActive={value === family}
            onSelect={() => onChange(family)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Swatch tile ─────────────────────────────────────────────────

function Swatch({
  family,
  isActive,
  onSelect,
}: {
  family: ThemeFamily;
  isActive: boolean;
  onSelect: () => void;
}) {
  const colors = THEME_SWATCHES[family];
  const label = THEME_FAMILY_LABELS[family];

  return (
    <Tooltip content={label} side="top">
      <button
        type="button"
        role="radio"
        aria-checked={isActive}
        aria-label={label}
        onClick={onSelect}
        className={clsx(
          "relative flex flex-col items-stretch justify-end h-9 rounded-md overflow-hidden cursor-pointer",
          "transition-all duration-150 active:scale-[0.96]",
          "ring-1 ring-edge/40 hover:ring-edge",
          isActive && "ring-2 ring-accent hover:ring-accent",
        )}
        style={{ backgroundColor: colors.surface }}
      >
        {/* Inner mantle band — communicates the surface-2 token
            (sidebar / secondary surface) so the swatch reads as a
            mini app window rather than a flat color chip. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/3"
          style={{ backgroundColor: colors.surface2 }}
        />

        {/* Foreground bar — short tick of text-color to anchor the
            "this is content" half of the swatch. */}
        <span
          aria-hidden
          className="absolute left-1.5 right-3 bottom-1.5 h-[3px] rounded-full opacity-80"
          style={{ backgroundColor: colors.fg }}
        />

        {/* Accent dot — the most identity-defining color, sits in
            the bottom-right corner where the eye lands last. */}
        <span
          aria-hidden
          className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />

        {/* Selected check — drawn on top, uses accent so it carries
            the theme identity even on hover. */}
        {isActive && (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <span
              className="flex items-center justify-center w-4 h-4 rounded-full shadow-sm"
              style={{ backgroundColor: colors.accent, color: colors.surface }}
            >
              <Check size={10} strokeWidth={3} />
            </span>
          </motion.span>
        )}
      </button>
    </Tooltip>
  );
}
