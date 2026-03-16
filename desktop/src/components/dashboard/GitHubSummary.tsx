/**
 * GitHubSummary — dashboard card content for the GitHub widget.
 *
 * Shows CI/Actions status summary: passing/failing counts and
 * per-repo status dots. Reads from the Tauri store.
 */
import { loadRepoData, CI_STATUS_COLORS } from "../../widgets/github/types";
import { useStoreData } from "../../hooks/useStoreData";
import { LS_GITHUB_REPOS } from "../../constants";
import StatusListSummary from "./StatusListSummary";
import type { GitHubRepo } from "../../widgets/github/types";
import type { GitHubCardPrefs } from "./dashboardPrefs";

interface GitHubSummaryProps {
  prefs: GitHubCardPrefs;
}

export default function GitHubSummary({ prefs }: GitHubSummaryProps) {
  const [repos] = useStoreData(LS_GITHUB_REPOS, loadRepoData);

  const passCount = repos.filter((r) => r.status === "success").length;
  const failCount = repos.filter((r) => r.status === "failure").length;
  const allPassing = failCount === 0 && passCount > 0;

  return (
    <StatusListSummary<GitHubRepo>
      items={repos}
      emptyMessage="No repos configured"
      statusColor={(r) => CI_STATUS_COLORS[r.status] ?? "bg-fg-4"}
      itemName={(r) => r.repo}
      itemKey={(r) => `${r.owner}/${r.repo}`}
      overall={
        prefs.status && repos.length > 0
          ? {
              dot: allPassing ? "bg-up" : failCount > 0 ? "bg-down" : "bg-fg-4",
              label: allPassing
                ? "All Passing"
                : failCount > 0
                  ? `${failCount} failing`
                  : "No data",
            }
          : null
      }
      counts={
        prefs.counts && repos.length > 0 ? (
          <>
            {passCount > 0 && <span className="text-up">{passCount} passing</span>}
            {failCount > 0 && <span className="text-down">{failCount} failing</span>}
            <span className="text-fg-4">{repos.length} total</span>
          </>
        ) : null
      }
      showItems={prefs.repos}
    />
  );
}
