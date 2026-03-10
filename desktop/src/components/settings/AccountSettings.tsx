import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { SubscriptionTier } from "../../auth";
import { Section, DisplayRow, ActionRow, ResetButton } from "./SettingsControls";
import { clsx } from "clsx";

// ── Update state machine ────────────────────────────────────────

type UpdateStatus =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "up-to-date" }
  | { step: "available"; version: string; body: string }
  | { step: "downloading"; downloaded: number; total: number }
  | { step: "ready" }
  | { step: "error"; message: string };

// ── Props ───────────────────────────────────────────────────────

interface AccountSettingsProps {
  authenticated: boolean;
  tier: SubscriptionTier;
  onLogin: () => void;
  onLogout: () => void;
  onResetAll: () => void;
  appVersion: string;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  uplink: "Uplink",
  uplink_unlimited: "Uplink Unlimited",
};

export default function AccountSettings({
  authenticated,
  tier,
  onLogin,
  onLogout,
  onResetAll,
  appVersion,
}: AccountSettingsProps) {
  const [status, setStatus] = useState<UpdateStatus>({ step: "idle" });

  const handleCheckForUpdates = useCallback(async () => {
    setStatus({ step: "checking" });
    try {
      const update = await check();
      if (!update) {
        setStatus({ step: "up-to-date" });
        return;
      }

      setStatus({
        step: "available",
        version: update.version,
        body: update.body ?? "",
      });
    } catch (err) {
      setStatus({
        step: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const handleDownloadAndInstall = useCallback(async () => {
    setStatus({ step: "downloading", downloaded: 0, total: 0 });
    try {
      const update = await check();
      if (!update) {
        setStatus({ step: "up-to-date" });
        return;
      }

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          setStatus((prev) =>
            prev.step === "downloading"
              ? { ...prev, total: event.data.contentLength ?? 0 }
              : prev,
          );
        } else if (event.event === "Progress") {
          setStatus((prev) =>
            prev.step === "downloading"
              ? { ...prev, downloaded: prev.downloaded + (event.data.chunkLength ?? 0) }
              : prev,
          );
        } else if (event.event === "Finished") {
          setStatus({ step: "ready" });
        }
      });

      setStatus({ step: "ready" });
    } catch (err) {
      setStatus({
        step: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const handleRelaunch = useCallback(async () => {
    await relaunch();
  }, []);

  return (
    <div>
      <Section title="Account">
        {authenticated ? (
          <>
            <DisplayRow
              label="Plan"
              value={TIER_LABELS[tier]}
              valueClass="text-[12px] text-accent font-semibold"
            />
            <ActionRow
              label="Session"
              action="Sign out"
              actionClass="text-fg-4 hover:text-error hover:bg-error/10"
              onClick={onLogout}
            />
          </>
        ) : (
          <ActionRow
            label="Not signed in"
            action="Sign in"
            actionClass="bg-accent text-surface font-semibold hover:bg-accent/90"
            onClick={onLogin}
          />
        )}
      </Section>

      <Section title="About">
        <DisplayRow label="Version" value={`v${appVersion}`} />
        <DisplayRow label="Runtime" value="Tauri v2" />
      </Section>

      <Section title="Updates">
        <UpdateRow
          status={status}
          onCheck={handleCheckForUpdates}
          onDownload={handleDownloadAndInstall}
          onRelaunch={handleRelaunch}
        />
      </Section>

      <Section title="Danger zone">
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-fg-2 leading-tight">
              Reset all settings
            </span>
            <span className="text-[10px] text-fg-4 leading-tight">
              Restore every setting to its factory default
            </span>
          </div>
          <ResetButton label="Reset everything" onClick={onResetAll} />
        </div>
      </Section>
    </div>
  );
}

// ── Update row component ────────────────────────────────────────

interface UpdateRowProps {
  status: UpdateStatus;
  onCheck: () => void;
  onDownload: () => void;
  onRelaunch: () => void;
}

function UpdateRow({ status, onCheck, onDownload, onRelaunch }: UpdateRowProps) {
  switch (status.step) {
    case "idle":
      return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <span className="text-[12px] text-fg-3">Check for new versions</span>
          <button
            onClick={onCheck}
            className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-base-250 text-fg-3 hover:text-fg-2 hover:bg-base-300 transition-colors cursor-pointer"
          >
            Check for updates
          </button>
        </div>
      );

    case "checking":
      return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <span className="text-[12px] text-fg-3">Checking for updates...</span>
          <div className="w-4 h-4 border-2 border-fg-4 border-t-accent rounded-full animate-spin" />
        </div>
      );

    case "up-to-date":
      return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-accent leading-tight">
              You're on the latest version
            </span>
          </div>
          <button
            onClick={onCheck}
            className="text-[10px] font-medium px-2.5 py-1 rounded-md text-fg-4 hover:text-fg-2 hover:bg-base-250/50 transition-colors cursor-pointer"
          >
            Check again
          </button>
        </div>
      );

    case "available":
      return (
        <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-fg-2 leading-tight">
                Update available: <span className="text-accent font-semibold">v{status.version}</span>
              </span>
              {status.body && (
                <span className="text-[10px] text-fg-4 leading-tight line-clamp-2">
                  {status.body}
                </span>
              )}
            </div>
            <button
              onClick={onDownload}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-accent text-surface hover:bg-accent/90 transition-colors cursor-pointer shrink-0 ml-4"
            >
              Download & install
            </button>
          </div>
        </div>
      );

    case "downloading": {
      const pct = status.total > 0 ? Math.round((status.downloaded / status.total) * 100) : 0;
      return (
        <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-fg-3 leading-tight">
              Downloading update...
            </span>
            <span className="text-[10px] text-fg-4 tabular-nums">
              {status.total > 0 ? `${pct}%` : "..."}
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-base-300 overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-300",
                status.total > 0 ? "bg-accent" : "bg-accent/50 animate-pulse",
              )}
              style={{ width: status.total > 0 ? `${pct}%` : "30%" }}
            />
          </div>
        </div>
      );
    }

    case "ready":
      return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-accent leading-tight">
              Update installed
            </span>
            <span className="text-[10px] text-fg-4 leading-tight">
              Restart to apply the update
            </span>
          </div>
          <button
            onClick={onRelaunch}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-accent text-surface hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Restart now
          </button>
        </div>
      );

    case "error":
      return (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-error leading-tight">
              Update check failed
            </span>
            <span className="text-[10px] text-fg-4 leading-tight line-clamp-1">
              {status.message}
            </span>
          </div>
          <button
            onClick={onCheck}
            className="text-[10px] font-medium px-2.5 py-1 rounded-md text-fg-4 hover:text-fg-2 hover:bg-base-250/50 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
  }
}
