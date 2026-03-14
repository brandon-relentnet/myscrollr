import { invoke } from "@tauri-apps/api/core";
import { ChevronUp, ChevronDown, AppWindow, EyeOff } from "lucide-react";
import clsx from "clsx";
import Tooltip from "./Tooltip";
import type { TickerPosition } from "../preferences";

interface TickerToolbarProps {
  position: TickerPosition;
  hovered: boolean;
  onTogglePosition: () => void;
  onHideTicker: () => void;
}

export default function TickerToolbar({
  position,
  hovered,
  onTogglePosition,
  onHideTicker,
}: TickerToolbarProps) {
  const PosIcon = position === "top" ? ChevronDown : ChevronUp;
  const posLabel = position === "top" ? "Move to bottom" : "Move to top";

  function openApp() {
    invoke("show_app_window").catch(() => {});
  }

  const btn = clsx(
    "w-7 h-7 flex items-center justify-center rounded-md",
    "text-fg-3 hover:text-fg hover:bg-surface-hover",
    "transition-colors duration-150",
  );

  return (
    <div
      className={clsx(
        "absolute right-0 top-0 bottom-0 z-50 flex items-center",
        "transition-opacity duration-200",
        hovered ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {/* Gradient fade from transparent to surface */}
      <div className="w-8 h-full bg-gradient-to-r from-transparent to-surface/80" />

      {/* Toolbar body */}
      <div className="h-full flex items-center gap-0.5 pr-2 bg-surface/80 backdrop-blur-sm">
        <Tooltip content="Open Scrollr" side="bottom">
          <button
            onClick={openApp}
            aria-label="Open Scrollr"
            className={btn}
          >
            <AppWindow size={14} />
          </button>
        </Tooltip>

        <Tooltip content={posLabel} side="bottom">
          <button
            onClick={onTogglePosition}
            aria-label={posLabel}
            className={btn}
          >
            <PosIcon size={16} />
          </button>
        </Tooltip>

        <Tooltip content="Hide Ticker" side="bottom">
          <button
            onClick={onHideTicker}
            aria-label="Hide Ticker"
            className={btn}
          >
            <EyeOff size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
