/**
 * GitHubSummary — dashboard card content for the GitHub widget.
 *
 * Shows CI/Actions status summary: passing/failing counts and
 * per-repo status dots. Reads from the Tauri store.
 */
import { useState, useEffect } from "react";
import { loadRepoData } from "../../widgets/github/types";
import { LS_GITHUB_REPOS } from "../../constants";
import { onStoreChange } from "../../lib/store";
import type { GitHubCardPrefs } from "./dashboardPrefs";

interface GitHubSummaryProps {
  prefs: GitHubCardPrefs;
}

const STATUS_DOTS: Record<string, string> = {
  success: "bg-up",
  failure: "bg-down",
  in_progress: "bg-warning",
  unavailable: "bg-fg-4",
};

export default function GitHubSummary({ prefs }: GitHubSummaryProps) {
  const [repos, setRepos] = useState(loadRepoData);

  useEffect(() => {
    return onStoreChange(LS_GITHUB_REPOS, () => setRepos(loadRepoData()));
  }, []);

  if (repos.length === 0) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        No repos configured
      </p>
    );
  }

  const passCount = repos.filter((r) => r.status === "success").length;
  const failCount = repos.filter((r) => r.status === "failure").length;
  const allPassing = failCount === 0 && passCount > 0;

  return (
    <div className="space-y-1.5">
      {/* Overall status */}
      {prefs.status && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${allPassing ? "bg-up" : failCount > 0 ? "bg-down" : "bg-fg-4"}`} />
          <span className="text-xs font-mono text-fg">
            {allPassing ? "All Passing" : failCount > 0 ? `${failCount} failing` : "No data"}
          </span>
        </div>
      )}

      {/* Counts */}
      {prefs.counts && (
        <div className="flex items-center gap-3 text-[11px] font-mono text-fg-3">
          {passCount > 0 && <span className="text-up">{passCount} passing</span>}
          {failCount > 0 && <span className="text-down">{failCount} failing</span>}
          <span className="text-fg-4">{repos.length} total</span>
        </div>
      )}

      {/* Repos */}
      {prefs.repos && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {repos.slice(0, 6).map((r) => (
            <div key={`${r.owner}/${r.repo}`} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[r.status] ?? "bg-fg-4"}`} />
              <span className="text-[10px] font-mono text-fg-3 truncate max-w-[120px]">
                {r.repo}
              </span>
            </div>
          ))}
          {repos.length > 6 && (
            <span className="text-[10px] font-mono text-fg-4">
              +{repos.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
