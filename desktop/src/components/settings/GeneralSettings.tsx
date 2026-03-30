import { useState, useCallback, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getStore, setStore } from "../../lib/store";
import clsx from "clsx";
import type {
  AppearancePrefs,
  WindowPrefs,
  Theme,
} from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  DisplayRow,
  ResetButton,
} from "./SettingsControls";

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

interface GeneralSettingsProps {
  appearance: AppearancePrefs;
  window_: WindowPrefs;
  onAppearanceChange: (prefs: AppearancePrefs) => void;
  onWindowChange: (prefs: WindowPrefs) => void;
  onReset: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
  appVersion: string;
}

// ── Options ─────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

const SCALE_PRESETS: { value: string; label: string }[] = [
  { value: "85", label: "85%" },
  { value: "100", label: "100%" },
  { value: "115", label: "115%" },
  { value: "130", label: "130%" },
];

// ── Component ───────────────────────────────────────────────────

export default function GeneralSettings({
  appearance,
  window_,
  onAppearanceChange,
  onWindowChange,
  onReset,
  autostartEnabled,
  onAutostartChange,
  appVersion,
}: GeneralSettingsProps) {
  const [status, setStatus] = useState<UpdateStatus>({ step: "idle" });
  const pendingUpdate = useRef<Update | null>(null);

  const setApp = <K extends keyof AppearancePrefs>(
    key: K,
    value: AppearancePrefs[K],
  ) => {
    onAppearanceChange({ ...appearance, [key]: value });
  };

  const handleCheckForUpdates = useCallback(async () => {
    setStatus({ step: "checking" });
    try {
      const update = await check();
      if (!update) {
        pendingUpdate.current = null;
        setStatus({ step: "up-to-date" });
        return;
      }

      // Same-version patch detection: if the remote version matches the
      // installed version AND the pub_date matches what we stored after
      // our last install, the user already has this exact build.
      const storedDate = getStore<string | null>("scrollr:lastUpdateDate", null);
      if (
        update.version === appVersion &&
        storedDate &&
        update.date === storedDate
      ) {
        pendingUpdate.current = null;
        setStatus({ step: "up-to-date" });
        return;
      }

      const isPatch = update.version === appVersion;
      pendingUpdate.current = update;
      setStatus({
        step: "available",
        version: update.version,
        body: isPatch
          ? "A patched build of your current version is available."
          : (update.body ?? ""),
      });
    } catch (err) {
      setStatus({
        step: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [appVersion]);

  const handleDownloadAndInstall = useCallback(async () => {
    const update = pendingUpdate.current;
    if (!update) {
      setStatus({ step: "error", message: "No update available. Try checking again." });
      return;
    }

    setStatus({ step: "downloading", downloaded: 0, total: 0 });
    try {
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
        }
      });

      // Store the pub_date of the build we just installed so future
      // same-version checks can tell we already have this build.
      if (update.date) {
        setStore("scrollr:lastUpdateDate", update.date);
      }

      setStatus({ step: "ready" });
    } catch (err) {
      setStatus({
        step: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const handleRelaunch = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      setStatus({
        step: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  return (
    <div>
      <Section title="Appearance">
        <SegmentedRow
          label="Color mode"
          description="Choose light or dark colors"
          value={appearance.theme}
          options={THEME_OPTIONS}
          onChange={(v) => setApp("theme", v)}
        />
        <SegmentedRow
          label="Display size"
          description="Make everything bigger or smaller"
          value={String(appearance.uiScale)}
          options={SCALE_PRESETS}
          onChange={(v) => setApp("uiScale", Number(v) as AppearancePrefs["uiScale"])}
        />
      </Section>

      <Section title="Window">
        <ToggleRow
          label="Always on top"
          description="Keep the ticker above all other windows"
          checked={window_.pinned}
          onChange={(v) => onWindowChange({ ...window_, pinned: v })}
        />
      </Section>

      <Section title="Startup">
        <ToggleRow
          label="Launch on system startup"
          description="Automatically open Scrollr when you start your computer"
          checked={autostartEnabled}
          onChange={onAutostartChange}
        />
      </Section>

      <Section title="About">
        <DisplayRow label="Version" value={appVersion ? `v${appVersion}` : "\u2014"} />
      </Section>

      <Section title="Updates">
        <UpdateRow
          status={status}
          onCheck={handleCheckForUpdates}
          onDownload={handleDownloadAndInstall}
          onRelaunch={handleRelaunch}
        />
      </Section>

      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset general settings" onClick={onReset} />
      </div>
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
            className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-base-250 text-fg-3 hover:text-fg-2 hover:bg-base-300 transition-colors cursor-pointer"
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
            className="text-[11px] font-medium px-2.5 py-1 rounded-md text-fg-4 hover:text-fg-2 hover:bg-base-250/50 transition-colors cursor-pointer"
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
            </div>
            <button
              onClick={onDownload}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-accent text-surface hover:bg-accent/90 transition-colors cursor-pointer shrink-0 ml-4"
            >
              Download & install
            </button>
          </div>
          {status.body && (
            <div className="max-h-32 overflow-y-auto scrollbar-thin rounded-md bg-base-200/50 px-2.5 py-2">
              <p className="text-[11px] text-fg-4 leading-relaxed whitespace-pre-wrap">
                {status.body}
              </p>
            </div>
          )}
        </div>
      );

    case "downloading": {
      const pct = status.total > 0
        ? Math.min(100, Math.round((status.downloaded / status.total) * 100))
        : 0;
      return (
        <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-fg-3 leading-tight">
              Downloading update...
            </span>
            <span className="text-[11px] text-fg-4 tabular-nums">
              {status.total > 0 ? `${pct}%` : "..."}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Download progress"
            className="w-full h-1 rounded-full bg-base-300 overflow-hidden"
          >
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-300",
                status.total > 0 ? "bg-accent" : "bg-accent/50 motion-safe:animate-pulse",
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
            <span className="text-[11px] text-fg-4 leading-tight">
              Restart to apply the update
            </span>
          </div>
          <button
            onClick={onRelaunch}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-accent text-surface hover:bg-accent/90 transition-colors cursor-pointer"
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
              Couldn't check for updates
            </span>
            <span className="text-[11px] text-fg-4 leading-tight line-clamp-1">
              {status.message}
            </span>
          </div>
          <button
            onClick={onCheck}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md text-fg-4 hover:text-fg-2 hover:bg-base-250/50 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
  }
}
