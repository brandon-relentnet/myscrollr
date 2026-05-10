/**
 * Channel route — renders channel feed or configuration.
 *
 * URL: /channel/:type/:tab
 *   - type: "finance" | "sports" | "rss" | "fantasy"
 *   - tab: "feed" | "configuration"
 *
 * Source-level actions (remove) are in the header bar.
 *
 * Display preferences live as a section inside the Configure tab —
 * the IA refactor (2026-05-09) folded the old Display tab into
 * Configure for symmetry with widgets and to reduce per-source
 * cognitive overhead.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import SourcePageLayout, { parseSourceTab, SourceNotFound } from "../components/SourcePageLayout";
import { useQuery } from "@tanstack/react-query";
import { getChannel, getAllChannels } from "../channels/registry";
import { dashboardQueryOptions } from "../api/queries";
import ChannelConfigPanel from "../channels/ChannelConfigPanel";
import FinanceDisplayPanel from "../channels/finance/DisplayPanel";
import SportsDisplayPanel from "../channels/sports/DisplayPanel";
import RssDisplayPanel from "../channels/rss/DisplayPanel";
import { useShell } from "../shell-context";
import { Section, ToggleRow, ResetButton, SegmentedRow } from "../components/settings/SettingsControls";
import DisplayItemsGrid from "../components/settings/DisplayItemsGrid";
import type { DisplayItemsSection } from "../components/settings/DisplayItemsGrid";
import FollowedPlayersPicker from "../components/settings/FollowedPlayersPicker";
import { loadPref } from "../preferences";
import type { Channel, ChannelType } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import type { FantasyDisplayPrefs, Venue } from "../preferences";

export const Route = createFileRoute("/channel/$type/$tab")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(dashboardQueryOptions()),
  component: ChannelRoute,
  pendingComponent: ChannelPending,
  errorComponent: RouteError,
});

function ChannelRoute() {
  const { type, tab: rawTab } = Route.useParams();
  const navigate = useNavigate();
  const tab = parseSourceTab(rawTab);

  const channel = getChannel(type);
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const { onDeleteChannel } = useShell();

  if (!channel) {
    return <SourceNotFound kind="Channel" name={type} />;
  }

  // Channels with display preferences. Drives the OverflowMenu's
  // "Display preferences" entry and the /display route's content.
  const HAS_DISPLAY: Record<string, boolean> = {
    finance: true,
    sports: true,
    rss: true,
    fantasy: true,
  };

  // Subtitle reflects the current sub-route in the breadcrumb:
  //   Home / Sports                   (feed — no subtitle)
  //   Home / Sports / Configure       (configuration tab)
  //   Home / Sports / Display         (display tab)
  const subtitle =
    tab === "configuration"
      ? "Configure"
      : tab === "display"
        ? "Display preferences"
        : undefined;

  return (
    <SourcePageLayout
      name={channel.name}
      description={subtitle}
      activeTab={tab}
      onTabChange={(t) =>
        navigate({ to: "/channel/$type/$tab", params: { type, tab: t } })
      }
      onBack={() => navigate({ to: "/feed" })}
      onManageTicker={() =>
        navigate({ to: "/settings", search: { tab: "ticker" } })
      }
      onRemove={() => {
        onDeleteChannel(type as ChannelType);
        navigate({ to: "/feed" });
      }}
      sourceKind="channel"
      hasDisplayPreferences={HAS_DISPLAY[type] ?? false}
    >
      {tab === "feed" && (
        <ChannelFeedTab
          type={type}
          dashboard={dashboard}
          channel={channel}
          onConfigure={() => navigate({ to: "/channel/$type/$tab", params: { type, tab: "configuration" } })}
        />
      )}
      {tab === "configuration" && (
        <ChannelConfigTab type={type} dashboard={dashboard} />
      )}
      {tab === "display" && <ChannelDisplayTab type={type} />}
    </SourcePageLayout>
  );
}

function ChannelFeedTab({
  type,
  dashboard,
  channel,
  onConfigure,
}: {
  type: string;
  dashboard: DashboardResponse | undefined;
  channel: NonNullable<ReturnType<typeof getChannel>>;
  onConfigure: () => void;
}) {
  const feedContext = {
    __dashboardLoaded: dashboard !== undefined,
    __hasConfig: (dashboard?.channels ?? []).some(
      (ch) => ch.channel_type === type && ch.enabled,
    ),
  };

  return <channel.FeedTab mode="comfort" feedContext={feedContext} onConfigure={onConfigure} />;
}

function ChannelConfigTab({
  type,
  dashboard,
}: {
  type: string;
  dashboard: DashboardResponse | undefined;
}) {
  const { tier } = useShell();
  const channelData = (dashboard?.channels ?? []).find(
    (ch) => ch.channel_type === type,
  );

  const manifest = getAllChannels().find((m) => m.id === type);
  const deliveryMode = loadPref<DeliveryMode>("deliveryMode", "polling");

  if (!channelData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
        <h2 className="text-base font-semibold text-fg">
          Configuration unavailable
        </h2>
        <p className="text-sm text-fg-3 leading-relaxed">
          This channel does not have a configuration panel.
        </p>
      </div>
    );
  }

  return (
    <ChannelConfigPanel
      channelType={type}
      channel={channelData as unknown as Channel}
      subscriptionTier={tier}
      connected={deliveryMode === "sse"}
      hex={manifest?.hex ?? "var(--color-accent)"}
    />
  );
}

function ChannelDisplayTab({ type }: { type: string }) {
  // Per-channel display preferences. Finance has the new live-preview
  // DisplayPanel (2026 polish); the others still use the old
  // venue-grid layout pending the same treatment.
  switch (type) {
    case "finance":
      return <FinanceDisplayPanel />;
    case "sports":
      return <SportsDisplayPanel />;
    case "rss":
      return <RssDisplayPanel />;
    case "fantasy":
      return <FantasyDisplay />;
    default:
      return null;
  }
}

// Keys on FantasyDisplayPrefs that are venue-typed. Drives the per-item
// rows below — adding a new venue-typed field here and in the interface
// is all it takes to expose it on the Display page.
type FantasyVenueKey =
  | "matchupScore"
  | "winProbability"
  | "matchupStatus"
  | "projectedPoints"
  | "week"
  | "record"
  | "standingsPosition"
  | "streak"
  | "injuryCount"
  | "topScorer"
  // Phase 1 player-stats (2026-04-25):
  | "topThreeScorers"
  | "worstStarter"
  | "benchOpportunity"
  | "injuryDetail";

interface FantasyVenueRow {
  key: FantasyVenueKey;
  label: string;
  description: string;
}

interface FantasyVenueGroup {
  title: string;
  rows: FantasyVenueRow[];
}

// Visual sub-grouping inside the grid. The Display tab has 10 venue
// items; flat-listing them is overwhelming. Three groups (Score &
// status / Standings / Roster) match the user's mental model of which
// feeds are about live game state, season-wide rank, and roster health.
const FANTASY_VENUE_GROUPS: FantasyVenueGroup[] = [
  {
    title: "Score & status",
    rows: [
      { key: "matchupScore", label: "Matchup score", description: "Your team vs. opponent, live or final" },
      { key: "winProbability", label: "Win probability", description: "62% chance to win" },
      { key: "matchupStatus", label: "Matchup status", description: "LIVE / FINAL / PRE badge" },
      { key: "projectedPoints", label: "Projected points", description: "Your projected total this week" },
      { key: "week", label: "Week number", description: "Current matchup week label" },
    ],
  },
  {
    title: "Standings",
    rows: [
      { key: "record", label: "Team record", description: "Season wins / losses (optionally ties)" },
      { key: "standingsPosition", label: "Standings position", description: "3rd of 10" },
      { key: "streak", label: "Current streak", description: "W3 / L2 badge" },
    ],
  },
  {
    title: "Roster",
    rows: [
      { key: "injuryCount", label: "Injury count", description: "Count of IR / DTD players on your roster" },
      { key: "topScorer", label: "Top scorer", description: "Highest-scoring active player on your team" },
    ],
  },
  {
    title: "Player stats",
    rows: [
      {
        key: "topThreeScorers",
        label: "Top 3 starters",
        description: "Mahomes 32, Hill 18, CMC 14 — each as its own segment",
      },
      {
        key: "worstStarter",
        label: "Lowest starter",
        description: "↓ Andrews 0 — the dud you couldn't sit (red)",
      },
      {
        key: "benchOpportunity",
        label: "Bench leader",
        description: "BN Pacheco 18 — points your bench is producing",
      },
      {
        key: "injuryDetail",
        label: "Injury report",
        description: "🚨 Saquon OUT, Mixon DTD — names + status (max 2 + overflow)",
      },
    ],
  },
];

function FantasyDisplay() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.fantasy;

  function patch(next: Partial<FantasyDisplayPrefs>) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        fantasy: { ...dp, ...next },
      },
    });
  }

  function toggle(key: keyof Pick<FantasyDisplayPrefs, "showStandings" | "showMatchups">) {
    patch({ [key]: !dp[key] } as Partial<FantasyDisplayPrefs>);
  }

  function handleReset() {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        fantasy: {
          matchupScore: "both",
          winProbability: "both",
          matchupStatus: "both",
          projectedPoints: "both",
          week: "both",
          record: "both",
          standingsPosition: "both",
          streak: "both",
          injuryCount: "both",
          topScorer: "both",
          // Phase 1 player-stats — same default as the rest.
          topThreeScorers: "both",
          worstStarter: "both",
          benchOpportunity: "both",
          injuryDetail: "both",
          // Phase 2 followed players — reset clears the list.
          // Users explicitly picked these; resetting display settings
          // shouldn't preserve them, otherwise "reset" wouldn't fully
          // restore defaults.
          followedPlayerKeys: [],
          showStandings: true,
          showMatchups: true,
          defaultSort: "name",
          defaultSubTab: "overview",
          primaryLeagueKey: null,
          enabledLeagueKeys: [],
        },
      },
    });
  }

  const SUB_TAB_OPTIONS = [
    { value: "overview", label: "Overview" },
    { value: "matchup", label: "Matchup" },
    { value: "standings", label: "Standings" },
    { value: "roster", label: "Roster" },
  ];

  const sections: DisplayItemsSection[] = FANTASY_VENUE_GROUPS.map((group) => ({
    title: group.title,
    rows: group.rows.map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description,
      value: dp[row.key],
    })),
  }));

  function applyDisplayChanges(changes: Record<string, Venue>) {
    patch(changes as Partial<FantasyDisplayPrefs>);
  }

  return (
    <div className="space-y-6 pb-8">
      <DisplayItemsGrid sections={sections} onChange={applyDisplayChanges} />
      <Section title="Followed players">
        <p className="text-[11px] text-fg-4 px-3 pb-2 leading-snug">
          Pick specific players from your rosters to track on the ticker.
          Each player gets their own chip showing their name, team, and
          current points.
        </p>
        <FollowedPlayersPicker
          followedPlayerKeys={dp.followedPlayerKeys}
          onChange={(next) => patch({ followedPlayerKeys: next })}
        />
      </Section>
      <Section title="Feed layout">
        <SegmentedRow
          label="Default view"
          description="Which sub-tab opens when you enter the Fantasy feed"
          value={dp.defaultSubTab}
          options={SUB_TAB_OPTIONS}
          onChange={(value) => patch({ defaultSubTab: value as FantasyDisplayPrefs["defaultSubTab"] })}
        />
        <ToggleRow label="Show standings section" checked={dp.showStandings} onChange={() => toggle("showStandings")} />
        <ToggleRow label="Show matchups section" checked={dp.showMatchups} onChange={() => toggle("showMatchups")} />
      </Section>
      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset display settings" onClick={handleReset} />
      </div>
    </div>
  );
}

function ChannelPending() {
  return (
    <div className="flex flex-col gap-3 p-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 motion-safe:animate-pulse"
        >
          <div className="w-8 h-8 rounded-lg bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 rounded bg-surface-2"
              style={{ width: `${55 + ((i * 17) % 35)}%` }}
            />
            <div
              className="h-2 rounded bg-surface-2/60"
              style={{ width: `${30 + ((i * 23) % 40)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
