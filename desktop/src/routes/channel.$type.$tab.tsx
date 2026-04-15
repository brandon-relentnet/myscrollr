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
import { Section, ToggleRow, ResetButton, SegmentedRow } from "../components/settings/SettingsControls";
import { useSportsConfig } from "../hooks/useSportsConfig";
import { loadPref } from "../preferences";
import type { Channel, ChannelType } from "../api/client";
import type { DashboardResponse, DeliveryMode } from "../types";
import type { FinanceDisplayPrefs, RssDisplayPrefs, FantasyDisplayPrefs } from "../preferences";

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

function FinanceDisplay() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.finance;

  function toggle(key: keyof Pick<FinanceDisplayPrefs, "showChange" | "showPrevClose" | "showLastUpdated">) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        finance: { ...dp, [key]: !dp[key] },
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
        finance: { showChange: true, showPrevClose: true, showLastUpdated: true, defaultSort: "alpha" },
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
      <Section title="Appearance">
        <ToggleRow label="Show % change" checked={dp.showChange} onChange={() => toggle("showChange")} />
        <ToggleRow label="Show previous close" checked={dp.showPrevClose} onChange={() => toggle("showPrevClose")} />
        <ToggleRow label="Show last updated" checked={dp.showLastUpdated} onChange={() => toggle("showLastUpdated")} />
      </Section>
      <Section title="Default Sort">
        <SegmentedRow
          label="Sort order"
          description="Default sort when opening the feed"
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

  function toggle(key: keyof Pick<typeof display, "showLogos" | "showTimer" | "showUpcoming" | "showFinal">) {
    setDisplay({ [key]: !display[key] });
  }

  function handleReset() {
    setDisplay({
      showUpcoming: true,
      showFinal: true,
      showLogos: true,
      showTimer: true,
    });
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Section title="Appearance">
        <ToggleRow label="Show team logos" checked={display.showLogos} onChange={() => toggle("showLogos")} />
        <ToggleRow label="Show game clock / status" checked={display.showTimer} onChange={() => toggle("showTimer")} />
      </Section>
      <Section title="Default Filters">
        <ToggleRow label="Include upcoming games" checked={display.showUpcoming} onChange={() => toggle("showUpcoming")} />
        <ToggleRow label="Include final scores" checked={display.showFinal} onChange={() => toggle("showFinal")} />
      </Section>
      <ResetButton label="Reset display settings" onClick={handleReset} />
    </div>
  );
}

function RssDisplay() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.rss;

  function toggle(key: keyof Pick<RssDisplayPrefs, "showDescription" | "showSource" | "showTimestamps">) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        rss: { ...dp, [key]: !dp[key] },
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
        rss: { showDescription: true, showSource: true, showTimestamps: true, articlesPerSource: 4 },
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
      <Section title="Feed & Ticker">
        <ToggleRow label="Show description" checked={dp.showDescription} onChange={() => toggle("showDescription")} />
        <ToggleRow label="Show source name" checked={dp.showSource} onChange={() => toggle("showSource")} />
        <ToggleRow label="Show timestamps" checked={dp.showTimestamps} onChange={() => toggle("showTimestamps")} />
      </Section>
      <Section title="Feed Balance">
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

function FantasyDisplay() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.fantasy;

  function toggle(key: keyof FantasyDisplayPrefs) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        fantasy: { ...dp, [key]: !dp[key] },
      },
    });
  }

  function handleReset() {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        fantasy: { showStandings: true, showInjuryCount: true },
      },
    });
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Section title="Feed">
        <ToggleRow label="Show standings" checked={dp.showStandings} onChange={() => toggle("showStandings")} />
        <ToggleRow label="Show injury count" checked={dp.showInjuryCount} onChange={() => toggle("showInjuryCount")} />
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
