/**
 * TopBar — the app's primary chrome row.
 *
 * Spans the full window width below the OS title bar. Contains:
 *   1. Scrollr brand mark + wordmark (left) — clickable, navigates Home.
 *      Replaces the old sidebar logo header so the sidebar can be
 *      pure navigation.
 *   2. Forward / Back navigation buttons (Spotify-style) — always
 *      visible, disabled when there's no history in that direction.
 *   3. [spacer]
 *   4. Ticker on/off pill, Pin pill — global toggles.
 *   5. Connection status — friendly Connected/Reconnecting/Offline.
 *
 * The TopBar is the single canonical home for ambient app-level
 * controls. Page-level actions live in PageLayout's header band.
 *
 * IA refactor 2026-05-09 (polish pass) — see
 * docs/superpowers/specs/2026-05-09-desktop-ia-refactor-design.md
 */
import { ArrowLeft, ArrowRight, Pin, Radio, RadioTower } from "lucide-react";
import clsx from "clsx";
import Tooltip from "./Tooltip";
import ConnectionIndicator from "./ConnectionIndicator";
import ScrollLogo from "./ScrollLogo";
import type { DeliveryHealth } from "../hooks/useDeliveryHealth";

// ── Props ───────────────────────────────────────────────────────

interface TopBarProps {
  /** Whether the standalone ticker window is alive. Drives logo glow + pill state. */
  tickerOn: boolean;
  /** Whether the always-on-top pin is engaged. */
  pinned: boolean;
  /** Connection-health derivation from useDeliveryHealth. */
  health: DeliveryHealth;
  /** Forward/back navigation state. */
  canBack: boolean;
  canForward: boolean;
  /** Click logo or back/forward to navigate. */
  onNavigateHome: () => void;
  onBack: () => void;
  onForward: () => void;
  /** Toggle ticker visibility — same contract as Settings → Ticker top toggle. */
  onToggleTicker: () => void;
  /** Toggle always-on-top pin. */
  onTogglePin: () => void;
}

// ── Component ───────────────────────────────────────────────────

export default function TopBar({
  tickerOn,
  pinned,
  health,
  canBack,
  canForward,
  onNavigateHome,
  onBack,
  onForward,
  onToggleTicker,
  onTogglePin,
}: TopBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="App controls"
      className="flex items-center h-11 shrink-0 px-3 gap-2 border-b border-edge/40 bg-surface-2/40 backdrop-blur-sm select-none"
    >
      {/* ── Brand mark (left) ──────────────────────────────── */}
      <button
        onClick={onNavigateHome}
        aria-label="Scrollr — go to home"
        className="flex items-center gap-2 px-1.5 h-7 rounded-md hover:bg-surface-hover transition-colors"
      >
        <ScrollLogo alive={tickerOn} size={20} />
        <span className="text-[13px] font-semibold text-fg tracking-tight">
          Scrollr
        </span>
      </button>

      {/* Vertical divider */}
      <div className="w-px h-5 bg-edge/40 mx-1" />

      {/* ── Back / Forward — Spotify-style ─────────────────── */}
      <div className="flex items-center gap-0.5">
        <Tooltip content="Back" side="bottom">
          <button
            onClick={onBack}
            disabled={!canBack}
            aria-label="Go back"
            className={clsx(
              "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
              canBack
                ? "text-fg-2 hover:text-fg hover:bg-surface-hover"
                : "text-fg-4/40 cursor-not-allowed",
            )}
          >
            <ArrowLeft size={14} />
          </button>
        </Tooltip>
        <Tooltip content="Forward" side="bottom">
          <button
            onClick={onForward}
            disabled={!canForward}
            aria-label="Go forward"
            className={clsx(
              "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
              canForward
                ? "text-fg-2 hover:text-fg hover:bg-surface-hover"
                : "text-fg-4/40 cursor-not-allowed",
            )}
          >
            <ArrowRight size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Ambient toggles (right side) ────────────────────── */}
      <div className="flex items-center gap-1">
        <Tooltip
          content={
            tickerOn ? "Hide the ticker window" : "Show the ticker window"
          }
          side="bottom"
        >
          <button
            type="button"
            role="switch"
            aria-checked={tickerOn}
            onClick={onToggleTicker}
            className={clsx(
              "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors",
              tickerOn
                ? "bg-accent/15 text-accent hover:bg-accent/20"
                : "text-fg-4 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            {tickerOn ? <RadioTower size={12} /> : <Radio size={12} />}
            <span>Ticker</span>
          </button>
        </Tooltip>

        <Tooltip
          content={
            pinned ? "Stop keeping window above others" : "Keep window above other windows"
          }
          side="bottom"
        >
          <button
            type="button"
            role="switch"
            aria-checked={pinned}
            onClick={onTogglePin}
            aria-label={pinned ? "Unpin window" : "Pin window on top"}
            className={clsx(
              "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
              pinned
                ? "bg-info/15 text-info hover:bg-info/20"
                : "text-fg-4 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            <Pin size={12} className={clsx(pinned && "fill-current")} />
          </button>
        </Tooltip>

        {/* Vertical divider before status */}
        <div className="w-px h-5 bg-edge/40 mx-1" />

        <ConnectionIndicator health={health} />
      </div>
    </div>
  );
}
