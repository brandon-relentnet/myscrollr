import { useState, useEffect, useCallback } from "react";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
} from "../../components/settings/SettingsControls";
import ConfigPanelLayout from "../../components/settings/ConfigPanelLayout";
import TickerPinSection from "../../components/settings/TickerPinSection";
import { useWidgetConfig } from "../../hooks/useWidgetConfig";
import { onStoreChange } from "../../lib/store";
import { DEFAULT_GITHUB_TICKER } from "../../preferences";
import { LS_GITHUB_REPOS } from "../../constants";
import { loadRepoData, repoKey } from "./types";
import type { GitHubRepo } from "./types";
import type { WidgetConfigPanelProps } from "../../hooks/useWidgetConfig";

const STATUS_LABELS: Record<string, string> = {
  success: "Passing",
  failure: "Failing",
  in_progress: "Running",
  unavailable: "Unavailable",
};

export default function GitHubConfigPanel({
  prefs,
  onPrefsChange,
}: WidgetConfigPanelProps) {
  const { config, update, setTicker } = useWidgetConfig("github", prefs, onPrefsChange);
  const [repoData, setRepoData] = useState<GitHubRepo[]>(loadRepoData);

  useEffect(() => {
    return onStoreChange(LS_GITHUB_REPOS, () => setRepoData(loadRepoData()));
  }, []);

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

  const passCount = repoData.filter((r) => r.status === "success").length;
  const failCount = repoData.filter((r) => r.status === "failure").length;

  const githubIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-github)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );

  return (
    <ConfigPanelLayout
      icon={githubIcon}
      hex="var(--color-widget-github)"
      title="GitHub Settings"
      subtitle="CI/Actions status for your repos"
      onReset={resetAll}
    >
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
        <TickerPinSection widgetId="github" prefs={prefs} onPrefsChange={onPrefsChange} />
      </Section>

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
    </ConfigPanelLayout>
  );
}
