/**
 * Channel route — renders channel feed, configuration, or display prefs.
 *
 * URL: /channel/:type/:tab
 *   - type: "finance" | "sports" | "rss" | "fantasy"
 *   - tab: "feed" | "configuration" | "display"
 *
 * Source-level actions (ticker toggle, remove) are in the header bar.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import SourcePageLayout, { parseSourceTab, SourceNotFound } from "../components/SourcePageLayout";
import { useQuery } from "@tanstack/react-query";
import { getChannel, getAllChannels } from "../channels/registry";
import { dashboardQueryOptions } from "../api/queries";
import ChannelConfigPanel from "../channels/ChannelConfigPanel";
import { useShell, useShellData } from "../shell-context";
import { Section, ToggleRow, ResetButton, SegmentedRow, VenueRow } from "../components/settings/SettingsControls";
import { useSportsConfig } from "../hooks/useSportsConfig";
import { loadPref } from "../preferences";
import type { Channel, ChannelType } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import type { FinanceDisplayPrefs, RssDisplayPrefs, FantasyDisplayPrefs, Venue } from "../preferences";
import type { SportsDisplayPrefs } from "../hooks/useSportsConfig";

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

  return (
    <SourcePageLayout
      name={channel.name}
      activeTab={tab}
      onTabChange={(t) =>
        navigate({ to: "/channel/$type/$tab", params: { type, tab: t } })
      }
      onBack={() => navigate({ to: "/feed" })}
      onRemove={() => {
        onDeleteChannel(type as ChannelType);
        navigate({ to: "/feed" });
      }}
      sourceKind="channel"
    >
      {tab === "feed" && (
        <ChannelFeedTab
          type={type}
          dashboard={dashboard}
          channel={channel}
          onConfigure={() => navigate({ to: "/channel/$type/$tab", params: { type, tab: "configuration" } })}
        />
      )}
      {tab === "configuration" && <ChannelConfigTab type={type} dashboard={dashboard} />}
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
    <div className="p-4">
      <ChannelConfigPanel
        channelType={type}
        channel={channelData as unknown as Channel}
        subscriptionTier={tier}
        connected={deliveryMode === "sse"}
        hex={manifest?.hex ?? "var(--color-accent)"}
      />
    </div>
  );
}

function ChannelDisplayTab({ type }: { type: string }) {
  switch (type) {
    case "finance":
      return <FinanceDisplay />;
    case "sports":
      return <SportsDisplay />;
    case "rss":
      return <RssDisplay />;
    case "fantasy":
      return <FantasyDisplay />;
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
          <h2 className="text-base font-semibold text-fg">No display settings</h2>
          <p className="text-sm text-fg-3 leading-relaxed">
            This channel does not have customizable display preferences.
          </p>
        </div>
      );
  }
}

// Label copy shared by all Display pages: "Feed" / "Both" / "Ticker" /
// "Off" — see VenueRow. Description text sets user expectations that
// the toggle affects both surfaces universally.
const VENUE_DESCRIPTION =
  "Off: hidden · Feed: only on feed page · Both: everywhere · Ticker: only on the ticker";

function FinanceDisplay() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.finance;

  function setVenue(key: "showChange" | "showPrevClose" | "showLastUpdated", venue: Venue) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        finance: { ...dp, [key]: venue },
      },
    });
  }

  function setDefaultSort(value: string) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        finance: { ...dp, defaultSort: value as FinanceDisplayPrefs["defaultSort"] },
      },
    });
  }

  function handleReset() {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        finance: { showChange: "both", showPrevClose: "both", showLastUpdated: "both", defaultSort: "alpha" },
      },
    });
  }

  const SORT_OPTIONS = [
    { value: "alpha", label: "A–Z" },
    { value: "price", label: "Price" },
    { value: "change", label: "% Change" },
    { value: "updated", label: "Updated" },
  ];

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Section title="Display items">
        <VenueRow label="Show % change" description={VENUE_DESCRIPTION} value={dp.showChange} onChange={(v) => setVenue("showChange", v)} />
        <VenueRow label="Show previous close" description={VENUE_DESCRIPTION} value={dp.showPrevClose} onChange={(v) => setVenue("showPrevClose", v)} />
        <VenueRow label="Show last updated" description={VENUE_DESCRIPTION} value={dp.showLastUpdated} onChange={(v) => setVenue("showLastUpdated", v)} />
      </Section>
      <Section title="Feed behavior">
        <SegmentedRow
          label="Sort order"
          description="Default sort for both feed and ticker"
          value={dp.defaultSort}
          options={SORT_OPTIONS}
          onChange={setDefaultSort}
        />
      </Section>
      <ResetButton label="Reset display settings" onClick={handleReset} />
    </div>
  );
}

function SportsDisplay() {
  const { display, setDisplay } = useSportsConfig();

  function setVenue(key: keyof SportsDisplayPrefs, venue: Venue) {
    setDisplay({ [key]: venue });
  }

  function handleReset() {
    setDisplay({
      showUpcoming: "both",
      showFinal: "both",
      showLogos: "both",
      showTimer: "both",
    });
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Section title="Display items">
        <VenueRow label="Show team logos" description={VENUE_DESCRIPTION} value={display.showLogos} onChange={(v) => setVenue("showLogos", v)} />
        <VenueRow label="Show game clock / status" description={VENUE_DESCRIPTION} value={display.showTimer} onChange={(v) => setVenue("showTimer", v)} />
      </Section>
      <Section title="Game filters">
        <VenueRow label="Include upcoming games" description={VENUE_DESCRIPTION} value={display.showUpcoming} onChange={(v) => setVenue("showUpcoming", v)} />
        <VenueRow label="Include final scores" description={VENUE_DESCRIPTION} value={display.showFinal} onChange={(v) => setVenue("showFinal", v)} />
      </Section>
      <ResetButton label="Reset display settings" onClick={handleReset} />
    </div>
  );
}

function RssDisplay() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.rss;

  function setVenue(key: "showDescription" | "showSource" | "showTimestamps", venue: Venue) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        rss: { ...dp, [key]: venue },
      },
    });
  }

  function setArticlesPerSource(value: string) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        rss: { ...dp, articlesPerSource: Number(value) },
      },
    });
  }

  function handleReset() {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        rss: { showDescription: "both", showSource: "both", showTimestamps: "both", articlesPerSource: 4 },
      },
    });
  }

  const ARTICLES_PER_SOURCE_OPTIONS = [
    { value: "2", label: "2" },
    { value: "4", label: "4" },
    { value: "6", label: "6" },
    { value: "10", label: "10" },
    { value: "0", label: "All" },
  ];

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Section title="Display items">
        <VenueRow label="Show description" description={VENUE_DESCRIPTION} value={dp.showDescription} onChange={(v) => setVenue("showDescription", v)} />
        <VenueRow label="Show source name" description={VENUE_DESCRIPTION} value={dp.showSource} onChange={(v) => setVenue("showSource", v)} />
        <VenueRow label="Show timestamps" description={VENUE_DESCRIPTION} value={dp.showTimestamps} onChange={(v) => setVenue("showTimestamps", v)} />
      </Section>
      <Section title="Feed behavior">
        <SegmentedRow
          label="Articles per source"
          description="Limit how many articles appear from each feed"
          value={String(dp.articlesPerSource)}
          options={ARTICLES_PER_SOURCE_OPTIONS}
          onChange={setArticlesPerSource}
        />
      </Section>
      <ResetButton label="Reset display settings" onClick={handleReset} />
    </div>
  );
}

// Keys on FantasyDisplayPrefs that are venue-typed. Drives the
// per-item rows below — adding a new venue-typed field here and in the
// interface is all it takes to expose it on the Display page.
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
  | "topScorer";

const FANTASY_VENUE_ROWS: Array<{ key: FantasyVenueKey; label: string; description: string }> = [
  { key: "matchupScore", label: "Matchup score", description: "Your team vs. opponent, live or final" },
  { key: "winProbability", label: "Win probability", description: "62% chance to win" },
  { key: "matchupStatus", label: "Matchup status", description: "LIVE / FINAL / PRE badge" },
  { key: "projectedPoints", label: "Projected points", description: "Your projected total this week" },
  { key: "week", label: "Week number", description: "Current matchup week label" },
  { key: "record", label: "Team record", description: "Season wins / losses (optionally ties)" },
  { key: "standingsPosition", label: "Standings position", description: "3rd of 10" },
  { key: "streak", label: "Current streak", description: "W3 / L2 badge" },
  { key: "injuryCount", label: "Injury count", description: "Count of IR / DTD players on your roster" },
  { key: "topScorer", label: "Top scorer", description: "Highest-scoring active player on your team" },
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

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Section title="Display items">
        {FANTASY_VENUE_ROWS.map((row) => (
          <VenueRow
            key={row.key}
            label={row.label}
            description={row.description}
            value={dp[row.key]}
            onChange={(v) => patch({ [row.key]: v } as Partial<FantasyDisplayPrefs>)}
          />
        ))}
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
      <ResetButton label="Reset display settings" onClick={handleReset} />
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
