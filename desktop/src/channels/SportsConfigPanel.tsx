import { useEffect, useState, useCallback } from "react";
import { Trophy } from "lucide-react";
import { Section, DisplayRow } from "../components/settings/SettingsControls";
import { CatalogBrowser } from "../components/settings/CatalogBrowser";
import { SelectedItems } from "../components/settings/SelectedItems";
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
  subscriptionTier,
  connected,
  hex,
}: SportsConfigPanelProps) {
  const isUnlimited = subscriptionTier === "uplink_unlimited";
  const isUplink = subscriptionTier === "uplink" || isUnlimited;

  const [catalog, setCatalog] = useState<TrackedLeague[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = channel.config as SportsChannelConfig;
  const leagues = Array.isArray(config?.leagues) ? config.leagues : [];
  const leagueSet = new Set(leagues);

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
  const sortedCatalog = [...catalog].sort((a, b) => {
    if (a.live_count !== b.live_count) return b.live_count - a.live_count;
    if (a.game_count !== b.game_count) return b.game_count - a.game_count;
    return a.name.localeCompare(b.name);
  });

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
        setError("Failed to save league changes");
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

  const delivery = isUnlimited
    ? "Real-time SSE"
    : isUplink
      ? "Poll 30s"
      : "Poll 60s";

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: `${hex}15`,
            boxShadow: `0 0 15px ${hex}15, 0 0 0 1px ${hex}20`,
          }}
        >
          <Trophy size={16} style={{ color: hex }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">Sports</h2>
          <p className="text-[11px] text-fg-4">
            Live scores via api-sports.io
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-4 flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-[12px]">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 hover:bg-error/10 rounded cursor-pointer"
          >
            <Trophy size={12} />
          </button>
        </div>
      )}

      {/* Status */}
      <Section title="Status">
        <DisplayRow label="Your Leagues" value={String(leagues.length)} />
        <DisplayRow label="Available" value={String(catalog.length)} />
        <DisplayRow label="Delivery" value={delivery} />
        <DisplayRow
          label="Connection"
          value={isUnlimited ? (connected ? "Live" : "Offline") : "Polling"}
        />
      </Section>

      {/* Selected leagues */}
      <SelectedItems
        title="Your Leagues"
        items={leagues.map((name) => ({
          name,
          entry: catalog.find((l) => l.name === name),
        }))}
        getKey={(item) => item.name}
        renderChip={(item) => (
          <div className="flex items-center gap-2 min-w-0">
            {item.entry?.logo_url && (
              <img
                src={item.entry.logo_url}
                alt=""
                className="w-4 h-4 object-contain shrink-0"
              />
            )}
            <span className="text-[12px] font-bold text-fg-2">
              {item.name}
            </span>
            {item.entry && item.entry.live_count > 0 && (
              <span className="text-[10px] text-live font-bold flex items-center gap-0.5">
                <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse" />
                {item.entry.live_count} Live
              </span>
            )}
            {item.entry &&
              item.entry.live_count === 0 &&
              item.entry.game_count === 0 && (
                <span className="text-[10px] text-fg-4">Off-season</span>
              )}
          </div>
        )}
        onRemove={removeLeague}
        onClearAll={() => updateLeagues([])}
        hex={hex}
        emptyIcon={<Trophy size={24} />}
        emptyMessage="No leagues selected — browse the catalog below"
        saving={saving}
      />

      {/* Catalog */}
      <CatalogBrowser
        title="League Catalog"
        items={sortedCatalog}
        getKey={(l) => l.name}
        selectedKeys={leagueSet}
        getCategory={(l) => l.category}
        matchesSearch={(l, q) => {
          const lower = q.toLowerCase();
          return (
            l.name.toLowerCase().includes(lower) ||
            l.category.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item, isAdded) => (
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
              style={isAdded ? { color: hex } : undefined}
            >
              {isAdded ? "Added" : "+ Add"}
            </span>
          </>
        )}
        hex={hex}
        searchPlaceholder="Search by league name..."
        saving={saving}
        loading={catalogLoading}
        error={catalogError}
        onAdd={addLeague}
        onRemove={removeLeague}
        onBulkAdd={(keys) => updateLeagues([...leagues, ...keys])}
        onBulkRemove={(keys) => {
          const toRemove = new Set(keys);
          updateLeagues(leagues.filter((l) => !toRemove.has(l)));
        }}
      />
    </div>
  );
}
