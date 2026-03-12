/**
 * Index route — welcome / empty state.
 *
 * Shown when no source is selected (first launch, or after removing
 * all channels and widgets).
 */
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, Puzzle } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto gap-6 p-6">
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-lg font-semibold text-fg">Welcome to Scrollr</h2>
        <p className="text-sm text-fg-3 leading-relaxed">
          Pick something from the sidebar to get started.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <div className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border border-edge/50 bg-surface-2/30">
          <TrendingUp size={24} className="text-fg-4" />
          <span className="text-xs font-medium text-fg-2">Channels</span>
          <span className="text-[11px] text-fg-4 leading-snug">
            Live stocks, scores, news, and fantasy sports
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border border-edge/50 bg-surface-2/30">
          <Puzzle size={24} className="text-fg-4" />
          <span className="text-xs font-medium text-fg-2">Widgets</span>
          <span className="text-[11px] text-fg-4 leading-snug">
            Clocks, weather, and system stats
          </span>
        </div>
      </div>
    </div>
  );
}
