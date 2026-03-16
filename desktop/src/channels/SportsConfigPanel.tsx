import { useCallback, useMemo } from "react";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import { useChannelConfig } from "../hooks/useChannelConfig";
import { sportsCatalogOptions } from "../api/queries";
import type { TrackedLeague } from "../api/queries";
import type { Channel } from "../api/client";

// ── Types ────────────────────────────────────────────────────────

interface SportsChannelConfig {
  leagues?: string[];
}

interface SportsConfigPanelProps {
  channel: Channel;
  subscriptionTier: string;
  connected: boolean;
  hex: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatNextGame(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "Starting";
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) {
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Component ────────────────────────────────────────────────────

export default function SportsConfigPanel({
  channel,
  hex,
}: SportsConfigPanelProps) {
  const { error, setError, saving, updateItems } = useChannelConfig<string[]>("sports", "leagues");

  const config = channel.config as SportsChannelConfig;
  const leagues = Array.isArray(config?.leagues) ? config.leagues : [];
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
      updateItems([...leagues, name]);
    },
    [leagues, leagueSet, updateItems],
  );

  const removeLeague = useCallback(
    (name: string) => {
      updateItems(leagues.filter((l) => l !== name));
    },
    [leagues, updateItems],
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
                      {formatNextGame(item.next_game)
                        ? `Next: ${formatNextGame(item.next_game)}`
                        : "Off-season"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span
              className="text-[10px] font-medium shrink-0"
              style={isSelected ? { color: hex } : undefined}
            >
              {isSelected ? "✓ Added" : "+ Add"}
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
        onBulkAdd={(keys: string[]) => updateItems([...leagues, ...keys])}
        onBulkRemove={(keys: string[]) => {
          const toRemove = new Set(keys);
          updateItems(leagues.filter((l) => !toRemove.has(l)));
        }}
        onClearAll={() => updateItems([])}
      />
    </div>
  );
}
