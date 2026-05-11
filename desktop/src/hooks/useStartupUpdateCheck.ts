// ── Startup update check ────────────────────────────────────────
//
// Runs a single update check shortly after the main window mounts.
// On a real update it surfaces a sonner toast with a "Download &
// install" action. On up-to-date or error it stays silent — the
// manual button in Settings → General is the recovery path.
//
// The same-version pub_date suppression logic mirrors the manual
// check in `components/settings/GeneralSettings.tsx`. Keep them in
// sync if you change either one.
//
// We delay 4s so:
//   1) Tauri webview, splash, and React hydration finish first.
//   2) If we're going to toast, it lands after the first paint, not
//      on top of it.
//   3) Brief flaky-network races on launch get a chance to settle.

import { useEffect, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { getStore, setStore } from "../lib/store";

const STARTUP_DELAY_MS = 4_000;
const TOAST_ID = "scrollr-startup-update";

// Storage keys — MUST match GeneralSettings.tsx exactly. Both files
// participate in the same pub_date reconciliation, so the keys are a
// shared contract.
const KEY_LAST_UPDATE_DATE = "scrollr:lastUpdateDate";
const KEY_PENDING_UPDATE = "scrollr:pendingUpdate";

interface PendingUpdate {
  version: string;
  date: string;
}

interface Options {
  /** When false (user disabled it in Settings), the hook does nothing. */
  enabled: boolean;
  /** Current installed version, used to suppress same-version false positives. */
  appVersion: string;
}

export function useStartupUpdateCheck({ enabled, appVersion }: Options) {
  // Latch so the check runs at most once per mount, even if React strict
  // mode double-invokes effects or props change after the first run.
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!appVersion) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (cancelled || !update) return;

        // Same-version patch suppression. If the remote version matches
        // what's installed AND the pub_date matches what we last recorded
        // (or there's no record yet, in which case we seed it), treat as
        // up-to-date. Otherwise fall through to the toast — a genuine
        // same-version rebuild has shipped.
        if (update.version === appVersion) {
          const storedDate = getStore<string | null>(KEY_LAST_UPDATE_DATE, null);
          if (storedDate === null) {
            setStore(KEY_LAST_UPDATE_DATE, update.date);
            return;
          }
          if (update.date === storedDate) return;
        }

        showUpdateToast(update, appVersion);
      } catch (err) {
        // Startup check failures are silent. The user can always retry
        // via Settings → General → Updates. We still log so devs can
        // see what's going wrong during local development.
        console.warn("[Scrollr] Startup update check failed:", err);
      }
    }, STARTUP_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, appVersion]);
}

// ── Toast flow ──────────────────────────────────────────────────
//
// Three states the toast walks through:
//   1) Prompt — "Update available, [Update] [Not now]"
//   2) Downloading — replaces the prompt with a progress message
//   3) Done — "Restart to apply, [Restart now]"
//
// We use a single toast id (`TOAST_ID`) so sonner replaces the toast
// in place rather than stacking new ones.

function showUpdateToast(update: Update, appVersion: string) {
  const isPatch = update.version === appVersion;
  const description = isPatch
    ? "A patched build of your current version is ready."
    : `Version ${update.version} is ready to download.`;

  toast.message("Update available", {
    id: TOAST_ID,
    description,
    duration: Infinity,
    action: {
      label: "Update",
      onClick: () => {
        // Fire-and-forget. downloadAndInstall is async but sonner's
        // action handler is sync — we just kick it off and let the
        // toast updates drive UX from here.
        void runDownloadAndInstall(update);
      },
    },
    cancel: {
      label: "Not now",
      onClick: () => toast.dismiss(TOAST_ID),
    },
  });
}

async function runDownloadAndInstall(update: Update) {
  toast.loading("Downloading update…", {
    id: TOAST_ID,
    description: "This may take a minute.",
    duration: Infinity,
  });

  try {
    await update.downloadAndInstall();

    // Record pending state so the next launch can reconcile pub_date.
    // See KEY_PENDING_UPDATE docs in GeneralSettings.tsx for why this
    // is "pending" rather than "last".
    if (update.version && update.date) {
      const pending: PendingUpdate = {
        version: update.version,
        date: update.date,
      };
      setStore(KEY_PENDING_UPDATE, pending);
    }

    toast.success("Update installed", {
      id: TOAST_ID,
      description: "Restart to apply.",
      duration: Infinity,
      action: {
        label: "Restart now",
        onClick: () => {
          void relaunch();
        },
      },
      cancel: {
        label: "Later",
        onClick: () => toast.dismiss(TOAST_ID),
      },
    });
  } catch (err) {
    toast.error("Couldn't install update", {
      id: TOAST_ID,
      description: err instanceof Error ? err.message : String(err),
      duration: 8_000,
    });
  }
}
