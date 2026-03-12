import { useEffect, useState, useCallback, useMemo } from "react";
import { Trophy } from "lucide-react";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import { fetch } from "@tauri-apps/plugin-http";
import { channelsApi, API_BASE } from "../api/client";
import type { Channel } from "../api/client";

// ── Types ────────────────────────────────────────────────────────

interface TrackedLeague {
  name: string;
  sport_api: string;
  category: string;
  country: string;
  logo_url: string;
  game_count: number;
  live_count: number;
  next_game: string | null;
}

interface SportsChannelConfig {
  leagues?: string[];
}

interface SportsConfigPanelProps {
  channel: Channel;
  getToken: () => Promise<string | null>;
  onChannelUpdate: (updated: Channel) => void;
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
  getToken,
  onChannelUpdate,
  hex,
}: SportsConfigPanelProps) {
  const [catalog, setCatalog] = useState<TrackedLeague[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = channel.config as SportsChannelConfig;
  const leagues = Array.isArray(config?.leagues) ? config.leagues : [];
  const leagueSet = useMemo(() => new Set(leagues), [leagues]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    fetch(`${API_BASE}/sports/leagues`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json() as Promise<TrackedLeague[]>;
      })
      .then(setCatalog)
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
  }, []);

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

  const updateLeagues = useCallback(
    async (next: string[]) => {
      setSaving(true);
      try {
        const updated = await channelsApi.update(
          "sports",
          { config: { leagues: next } },
          getToken,
        );
        onChannelUpdate(updated);
      } catch {
        setError("Failed to save — try again");
      } finally {
        setSaving(false);
      }
    },
    [getToken, onChannelUpdate],
  );

  const addLeague = useCallback(
    (name: string) => {
      if (leagueSet.has(name)) return;
      updateLeagues([...leagues, name]);
    },
    [leagues, leagueSet, updateLeagues],
  );

  const removeLeague = useCallback(
    (name: string) => {
      updateLeagues(leagues.filter((l) => l !== name));
    },
    [leagues, updateLeagues],
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
        getKey={(l) => l.name}
        getCategory={(l) => l.category}
        matchesSearch={(l, q) => {
          const lower = q.toLowerCase();
          return (
            l.name.toLowerCase().includes(lower) ||
            l.category.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item, isSelected) => (
          <>
            <div className="flex items-center gap-2 min-w-0 mr-2">
              {item.logo_url && (
                <img
                  src={item.logo_url}
                  alt=""
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
        onBulkAdd={(keys) => updateLeagues([...leagues, ...keys])}
        onBulkRemove={(keys) => {
          const toRemove = new Set(keys);
          updateLeagues(leagues.filter((l) => !toRemove.has(l)));
        }}
        onClearAll={() => updateLeagues([])}
      />
    </div>
  );
}
