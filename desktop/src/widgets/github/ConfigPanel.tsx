import { useState, useEffect, useCallback } from "react";
import {
  Section,
  ToggleRow,
  SliderRow,
  SegmentedRow,
  ResetButton,
} from "../../components/settings/SettingsControls";
import type {
  AppPreferences,
  GitHubWidgetConfig,
  GitHubTickerConfig,
} from "../../preferences";
import { DEFAULT_GITHUB_TICKER, savePrefs } from "../../preferences";
import { useWidgetPin } from "../../hooks/useWidgetPin";
import { LS_GITHUB_REPOS, PIN_SIDE_OPTIONS } from "../../constants";
import { loadRepoData, repoKey } from "./types";
import type { GitHubRepo } from "./types";

interface GitHubConfigPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

const STATUS_LABELS: Record<string, string> = {
  success: "Passing",
  failure: "Failing",
  in_progress: "Running",
  unavailable: "Unavailable",
};

export default function GitHubConfigPanel({
  prefs,
  onPrefsChange,
}: GitHubConfigPanelProps) {
  const config = prefs.widgets.github;
  const [repoData, setRepoData] = useState<GitHubRepo[]>(loadRepoData);

  const { isPinned, pinSide, togglePin, setPinSide } = useWidgetPin("github", prefs, onPrefsChange);

  // Re-read when localStorage changes (FeedTab refreshes data)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_GITHUB_REPOS) setRepoData(loadRepoData());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback(
    (patch: Partial<GitHubWidgetConfig>) => {
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          github: { ...config, ...patch },
        },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, config, onPrefsChange],
  );

  const setTicker = useCallback(
    (patch: Partial<GitHubTickerConfig>) => {
      update({ ticker: { ...config.ticker, ...patch } });
    },
    [update, config.ticker],
  );

  const isRepoExcluded = (key: string) =>
    config.ticker.excludedRepos.includes(key);

  const toggleRepo = useCallback(
    (key: string) => {
      const excluded = config.ticker.excludedRepos;
      const next = excluded.includes(key)
        ? excluded.filter((r) => r !== key)
        : [...excluded, key];
      setTicker({ excludedRepos: next });
    },
    [config.ticker.excludedRepos, setTicker],
  );

  const resetAll = useCallback(() => {
    update({
      pollInterval: 120,
      ticker: { ...DEFAULT_GITHUB_TICKER },
    });
  }, [update]);

  // Status summary
  const passCount = repoData.filter((r) => r.status === "success").length;
  const failCount = repoData.filter((r) => r.status === "failure").length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--color-widget-github) 15%, transparent)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-github)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">GitHub Settings</h2>
          <p className="text-[11px] text-fg-4">CI/Actions status for your repos</p>
        </div>
      </div>

      {/* Toolbar Preview */}
      <Section title="Toolbar Preview">
        {repoData.length > 0 ? (
          <div className="px-3 py-2.5 text-[11px] text-fg-3 font-mono">
            {repoData.length} repo{repoData.length !== 1 ? "s" : ""}
            {" \u2014 "}
            {passCount > 0 && <span className="text-up">{passCount} passing</span>}
            {passCount > 0 && failCount > 0 && ", "}
            {failCount > 0 && <span className="text-down">{failCount} failing</span>}
            {passCount === 0 && failCount === 0 && <span className="text-fg-4">no data yet</span>}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            Add repos in the GitHub tab to see CI status.
          </div>
        )}
      </Section>

      {/* Ticker */}
      <Section title="Ticker">
        {config.repos.map((r) => {
          const key = repoKey(r);
          const rd = repoData.find((d) => repoKey(d) === key);
          const statusLabel = rd ? STATUS_LABELS[rd.status] ?? "Unknown" : "Loading";
          const workflow = rd?.workflowName ? ` \u00B7 ${rd.workflowName}` : "";
          return (
            <ToggleRow
              key={key}
              label={key}
              description={`${statusLabel}${workflow}`}
              checked={!isRepoExcluded(key)}
              onChange={() => toggleRepo(key)}
            />
          );
        })}
        {config.repos.length === 0 && (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            Add repos in the GitHub tab to choose what shows on the ticker.
          </div>
        )}
        <ToggleRow
          label="Keep in a fixed spot"
          description="Stay on one side instead of scrolling across"
          checked={isPinned}
          onChange={togglePin}
        />
        {isPinned && (
          <SegmentedRow
            label="Which side"
            value={pinSide}
            options={PIN_SIDE_OPTIONS}
            onChange={setPinSide}
          />
        )}
      </Section>

      {/* Polling */}
      <Section title="Polling">
        <SliderRow
          label="Refresh interval"
          description="How often to check workflow status"
          value={config.pollInterval}
          min={60}
          max={300}
          step={30}
          displayValue={config.pollInterval >= 60
            ? `${Math.floor(config.pollInterval / 60)}m${config.pollInterval % 60 ? ` ${config.pollInterval % 60}s` : ""}`
            : `${config.pollInterval}s`}
          onChange={(v) => update({ pollInterval: v })}
        />
      </Section>

      {/* Reset */}
      <div className="flex items-center justify-end pt-2 px-3">
        <ResetButton onClick={resetAll} />
      </div>
    </div>
  );
}
