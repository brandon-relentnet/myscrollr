import type { ChipColorMode } from "../../preferences";

// ── Color class sets ────────────────────────────────────────────
// Each set maps to the Tailwind classes a chip uses for bg, border,
// hover, and text at various opacities.

export interface ChipColors {
  bg: string;
  border: string;
  hoverBorder: string;
  text: string;
  textDim: string;
  textFaint: string;
}

const PRIMARY: ChipColors = {
  bg: "bg-primary/[0.06]",
  border: "border-primary/25",
  hoverBorder: "hover:border-primary/40",
  text: "text-primary",
  textDim: "text-primary/60",
  textFaint: "text-primary/40",
};

const SECONDARY: ChipColors = {
  bg: "bg-secondary/[0.06]",
  border: "border-secondary/25",
  hoverBorder: "hover:border-secondary/40",
  text: "text-secondary",
  textDim: "text-secondary/60",
  textFaint: "text-secondary/40",
};

const INFO: ChipColors = {
  bg: "bg-info/[0.06]",
  border: "border-info/25",
  hoverBorder: "hover:border-info/40",
  text: "text-info",
  textDim: "text-info/60",
  textFaint: "text-info/40",
};

const PURPLE: ChipColors = {
  bg: "bg-accent-purple/[0.06]",
  border: "border-accent-purple/25",
  hoverBorder: "hover:border-accent-purple/40",
  text: "text-accent-purple",
  textDim: "text-accent-purple/60",
  textFaint: "text-accent-purple/40",
};

const MUTED: ChipColors = {
  bg: "bg-fg-3/[0.04]",
  border: "border-edge",
  hoverBorder: "hover:border-fg-3/30",
  text: "text-fg-2",
  textDim: "text-fg-3",
  textFaint: "text-fg-4",
};

// ── Channel → color mapping ─────────────────────────────────────

const CHANNEL_MAP: Record<string, ChipColors> = {
  finance: PRIMARY,
  sports: SECONDARY,
  rss: INFO,
  fantasy: PURPLE,
};

// ── Resolver ────────────────────────────────────────────────────

export function getChipColors(mode: ChipColorMode, channel: string): ChipColors {
  if (mode === "accent") return PRIMARY;
  if (mode === "muted") return MUTED;
  return CHANNEL_MAP[channel] ?? PURPLE;
}
