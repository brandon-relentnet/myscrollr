import { useCallback, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import { useSportsConfig } from "../hooks/useSportsConfig";
import { formatCountdown } from "../utils/gameHelpers";
import { sportsCatalogOptions } from "../api/queries";
import type { TrackedLeague } from "../api/queries";
import type { Channel } from "../api/client";

// ── Types ────────────────────────────────────────────────────────

interface SportsConfigPanelProps {
  channel: Channel;
  subscriptionTier: string;
  connected: boolean;
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function SportsConfigPanel({
  hex,
}: SportsConfigPanelProps) {
  const { leagues, display, setLeagues, setDisplay, saving } =
    useSportsConfig();
  const [error, setError] = useState<string | null>(null);

  const leagueSet = useMemo(() => new Set(leagues), [leagues]);

  // ── Catalog query ──────────────────────────────────────────────
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(sportsCatalogOptions());

  // Sort catalog: live first, then by game count, then alpha
  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort((a, b) => {
        if (a.live_count !== b.live_count) return b.live_count - a.live_count;
        if (a.game_count !== b.game_count) return b.game_count - a.game_count;
        return a.name.localeCompare(b.name);
      }),
    [catalog],
  );

  const addLeague = useCallback(
    (name: string) => {
      if (leagueSet.has(name)) return;
      setLeagues([...leagues, name]);
    },
    [leagues, leagueSet, setLeagues],
  );

  const removeLeague = useCallback(
    (name: string) => {
      setLeagues(leagues.filter((l) => l !== name));
    },
    [leagues, setLeagues],
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <SetupBrowser
        title="Sports"
        subtitle="Live scores from your favorite leagues"
        icon={Trophy}
        hex={hex}
        items={sortedCatalog}
        selectedKeys={leagueSet}
        getKey={(l: TrackedLeague) => l.name}
        getCategory={(l: TrackedLeague) => l.category}
        matchesSearch={(l: TrackedLeague, q: string) => {
          const lower = q.toLowerCase();
          return (
            l.name.toLowerCase().includes(lower) ||
            l.category.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item: TrackedLeague, isSelected: boolean) => (
          <>
            <div className="flex items-center gap-2 min-w-0 mr-2">
              {item.logo_url && (
                <img
                  src={item.logo_url}
                  alt={item.name}
                  className="w-5 h-5 object-contain shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-fg-2">
                  {item.name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-fg-4 truncate">
                  <span>{item.country}</span>
                  {item.live_count > 0 && (
                    <span className="flex items-center gap-0.5 text-live font-bold">
                      <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
                      {item.live_count} Live
                    </span>
                  )}
                  {item.live_count === 0 && item.game_count > 0 && (
                    <span>{item.game_count} games</span>
                  )}
                  {item.game_count === 0 && (
                    <span className="text-fg-4/60">
                      {item.is_offseason
                        ? "Off-season"
                        : item.next_game
                          ? `Next: ${formatCountdown(item.next_game)}`
                          : "No games scheduled"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span
              className="text-[10px] font-medium shrink-0"
              style={isSelected ? { color: hex } : undefined}
            >
              {isSelected ? "\u2713 Added" : "+ Add"}
            </span>
          </>
        )}
        searchPlaceholder="Search by league or sport..."
        error={error}
        onDismissError={() => setError(null)}
        loading={catalogLoading}
        catalogError={catalogError}
        saving={saving}
        onAdd={addLeague}
        onRemove={removeLeague}
        onBulkAdd={(keys: string[]) => setLeagues([...leagues, ...keys])}
        onBulkRemove={(keys: string[]) => {
          const toRemove = new Set(keys);
          setLeagues(leagues.filter((l) => !toRemove.has(l)));
        }}
        onClearAll={() => setLeagues([])}
      />

      {/* Display preferences */}
      <div className="mt-6 border-t border-edge pt-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-fg-3 mb-3">
          Display
        </h3>
        <div className="space-y-2">
          {([
            { key: "showLogos" as const, label: "Show team logos" },
            { key: "showTimer" as const, label: "Show game clock" },
            { key: "compact" as const, label: "Show other games" },
            { key: "showUpcoming" as const, label: "Show upcoming games" },
            { key: "showFinal" as const, label: "Show final scores" },
            { key: "stats" as const, label: "Show stats footer" },
          ]).map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-hover/50 cursor-pointer"
            >
              <span className="text-xs text-fg-2">{label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={display[key]}
                onClick={() => setDisplay({ [key]: !display[key] })}
                className={clsx(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                  display[key] ? "bg-primary" : "bg-edge-2",
                )}
              >
                <span
                  className={clsx(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
                    display[key]
                      ? "translate-x-4 ml-0.5"
                      : "translate-x-0 ml-0.5",
                  )}
                />
              </button>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
