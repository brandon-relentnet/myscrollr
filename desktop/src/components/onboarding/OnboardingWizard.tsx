import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { channelsApi } from "../../api/client";
import { queryKeys } from "../../api/queries";
import type { ChannelType } from "../../api/client";
import type { AppPreferences } from "../../preferences";

import WizardShell from "./WizardShell";
import StepChannels from "./StepChannels";
import StepConfigureFinance from "./StepConfigureFinance";
import StepConfigureSports from "./StepConfigureSports";
import StepConfigureRss from "./StepConfigureRss";
import StepConfigureFantasy from "./StepConfigureFantasy";
import StepWidgets from "./StepWidgets";

// ── Types ───────────────────────────────────────────────────────

type WizardStep =
  | { kind: "channels" }
  | { kind: "configure"; channel: ChannelType }
  | { kind: "widgets" };

interface OnboardingWizardProps {
  prefs: AppPreferences;
  onComplete: (prefs: AppPreferences) => void;
}

// ── Helper: build step sequence based on selected channels ──────

function buildSteps(selectedChannels: Set<ChannelType>): WizardStep[] {
  const steps: WizardStep[] = [{ kind: "channels" }];
  const order: ChannelType[] = ["finance", "sports", "rss", "fantasy"];
  for (const ch of order) {
    if (selectedChannels.has(ch)) {
      steps.push({ kind: "configure", channel: ch });
    }
  }
  steps.push({ kind: "widgets" });
  return steps;
}

// ── Component ───────────────────────────────────────────────────

export default function OnboardingWizard({ prefs, onComplete }: OnboardingWizardProps) {
  const queryClient = useQueryClient();

  // ── Wizard state ──
  const [selectedChannels, setSelectedChannels] = useState<Set<ChannelType>>(new Set());
  const [financeSymbols, setFinanceSymbols] = useState<Set<string>>(new Set());
  const [sportsLeagues, setSportsLeagues] = useState<Set<string>>(new Set());
  const [rssFeeds, setRssFeeds] = useState<Set<string>>(new Set());
  const [fantasyConnected, setFantasyConnected] = useState(false);
  const [selectedWidgets, setSelectedWidgets] = useState<Set<string>>(new Set(["weather", "clock"]));
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  // ── Derived step sequence ──
  const steps = buildSteps(selectedChannels);
  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;

  // ── Toggle helpers ──
  const toggleChannel = useCallback((id: ChannelType) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSymbol = useCallback((s: string) => {
    setFinanceSymbols((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  const toggleLeague = useCallback((id: string) => {
    setSportsLeagues((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleFeed = useCallback((url: string) => {
    setRssFeeds((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setSelectedWidgets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── API: create channel + update config ──
  async function provisionChannel(type: ChannelType): Promise<void> {
    try {
      await channelsApi.create(type);
    } catch {
      // Channel may already exist (409), which is fine
    }

    // Update config with selected items
    try {
      if (type === "finance" && financeSymbols.size > 0) {
        await channelsApi.update(type, {
          config: { symbols: [...financeSymbols] },
        });
      } else if (type === "sports" && sportsLeagues.size > 0) {
        await channelsApi.update(type, {
          config: { leagues: [...sportsLeagues] },
        });
      } else if (type === "rss" && rssFeeds.size > 0) {
        await channelsApi.update(type, {
          config: { feeds: [...rssFeeds] },
        });
      }
      // Fantasy: no config update needed — Yahoo OAuth handles it
    } catch {
      toast.error(`Couldn't configure ${type} — you can set it up in Settings`);
    }
  }

  // ── Navigation: Next ──
  const handleNext = useCallback(async () => {
    if (busy) return;

    const step = steps[stepIndex];

    // If leaving a configure step, provision the channel
    if (step.kind === "configure") {
      setBusy(true);
      await provisionChannel(step.channel);
      setBusy(false);
    }

    // If this is the last step (widgets), finish
    if (stepIndex >= steps.length - 1) {
      setBusy(true);

      // Provision any channels that don't have a configure step
      // (channels selected but skipped through)
      for (const ch of selectedChannels) {
        try {
          await channelsApi.create(ch);
        } catch {
          // 409 is fine
        }
      }

      // Build final prefs
      const widgetIds = [...selectedWidgets];
      const pinnedIds = [
        ...Array.from(selectedChannels),
        ...widgetIds,
      ];

      const nextPrefs: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          enabledWidgets: widgetIds,
          widgetsOnTicker: widgetIds,
        },
        pinnedSources: pinnedIds,
        onboardingComplete: true,
      };

      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setBusy(false);
      onComplete(nextPrefs);
      return;
    }

    setStepIndex((i) => i + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, stepIndex, steps, selectedChannels, selectedWidgets, prefs, queryClient, onComplete]);

  // ── Navigation: Back ──
  const handleBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  // ── Navigation: Skip ──
  const handleSkip = useCallback(() => {
    // Skip always advances, without provisioning
    if (stepIndex >= steps.length - 1) {
      // Skipping the last step = finish with defaults
      const nextPrefs: AppPreferences = {
        ...prefs,
        pinnedSources: [...Array.from(selectedChannels)],
        onboardingComplete: true,
      };
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      onComplete(nextPrefs);
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, prefs, selectedChannels, queryClient, onComplete]);

  // ── Render current step ──
  function renderStep() {
    if (!currentStep) return null;

    switch (currentStep.kind) {
      case "channels":
        return <StepChannels selected={selectedChannels} onToggle={toggleChannel} />;
      case "configure":
        switch (currentStep.channel) {
          case "finance":
            return <StepConfigureFinance selected={financeSymbols} onToggle={toggleSymbol} />;
          case "sports":
            return <StepConfigureSports selected={sportsLeagues} onToggle={toggleLeague} />;
          case "rss":
            return <StepConfigureRss selected={rssFeeds} onToggle={toggleFeed} />;
          case "fantasy":
            return (
              <StepConfigureFantasy
                connected={fantasyConnected}
                onConnect={() => {
                  // TODO: trigger Yahoo OAuth flow
                  // For now, just mark as connected for UX
                  setFantasyConnected(true);
                }}
              />
            );
          default:
            return null;
        }
      case "widgets":
        return <StepWidgets selected={selectedWidgets} onToggle={toggleWidget} />;
    }
  }

  // ── Shell props per step ──
  function stepTitle(): string {
    if (!currentStep) return "";
    switch (currentStep.kind) {
      case "channels": return "Pick Your Channels";
      case "configure":
        switch (currentStep.channel) {
          case "finance": return "Set Up Finance";
          case "sports": return "Set Up Sports";
          case "rss": return "Set Up RSS Feeds";
          case "fantasy": return "Set Up Fantasy";
          default: return "Configure";
        }
      case "widgets": return "Pick Your Widgets";
    }
  }

  function stepSubtitle(): string | undefined {
    if (!currentStep) return undefined;
    switch (currentStep.kind) {
      case "channels": return "Select the data sources you want on your ticker.";
      case "configure":
        switch (currentStep.channel) {
          case "finance": return "Choose stocks and crypto to track.";
          case "sports": return "Select the leagues you follow.";
          case "rss": return "Pick news and blog feeds.";
          case "fantasy": return "Connect your Yahoo Fantasy account.";
          default: return undefined;
        }
      case "widgets": return "Add utility widgets to your ticker.";
    }
  }

  const isLastStep = stepIndex >= steps.length - 1;

  return (
    <WizardShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title={stepTitle()}
      subtitle={stepSubtitle()}
      showBack={stepIndex > 0}
      showSkip
      nextLabel={isLastStep ? "Finish" : "Next"}
      nextDisabled={busy}
      onBack={handleBack}
      onNext={handleNext}
      onSkip={handleSkip}
    >
      {renderStep()}
    </WizardShell>
  );
}
