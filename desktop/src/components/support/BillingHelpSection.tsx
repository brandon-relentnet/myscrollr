import { useState } from "react";
import { Settings, ExternalLink, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { open } from "@tauri-apps/plugin-shell";
import { toast } from "sonner";
import { isAuthenticated } from "../../auth";
import { authFetch } from "../../api/client";
import { BILLING_FAQ } from "./support-content";

export default function BillingHelpSection() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const authenticated = isAuthenticated();

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const res = await authFetch<{ url: string }>(
        "/users/me/subscription/portal",
        { method: "POST" },
      );
      await open(res.url);
    } catch (err) {
      toast.error("Failed to open subscription portal", {
        description: (err as Error).message,
      });
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleViewPlans() {
    await open("https://myscrollr.com/uplink");
  }

  function toggleFaq(index: number) {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        {/* Manage Subscription */}
        {authenticated ? (
          <button
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="flex items-start gap-3 rounded-lg border border-edge/30 p-4 text-left transition-colors hover:bg-surface-2/50 disabled:opacity-50"
          >
            <Settings size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-fg">
                {portalLoading ? "Opening..." : "Manage Subscription"}
              </p>
              <p className="mt-0.5 text-xs text-fg-3">
                Update payment, cancel, or change plan
              </p>
            </div>
          </button>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-edge/30 p-4">
            <Settings size={18} className="mt-0.5 shrink-0 text-fg-3" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-fg">Manage Subscription</p>
              <p className="mt-0.5 text-xs text-fg-3">
                Sign in to manage your subscription
              </p>
            </div>
          </div>
        )}

        {/* View Plans */}
        <button
          onClick={handleViewPlans}
          className="flex items-start gap-3 rounded-lg border border-edge/30 p-4 text-left transition-colors hover:bg-surface-2/50"
        >
          <ExternalLink size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-fg">View Plans</p>
            <p className="mt-0.5 text-xs text-fg-3">Compare Uplink tiers</p>
          </div>
        </button>
      </div>

      {/* Billing FAQ */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-3">
          Common Questions
        </p>
        <div className="space-y-0">
          {BILLING_FAQ.map((item, i) => {
            const isOpen = expandedIndex === i;
            return (
              <div key={i} className="border-b border-edge/30">
                <button
                  onClick={() => toggleFaq(i)}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-surface-2/50"
                >
                  <span className="text-sm font-medium text-fg">
                    {item.question}
                  </span>
                  <ChevronDown
                    size={16}
                    className={clsx(
                      "shrink-0 text-fg-3 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                <div
                  className={clsx(
                    "overflow-hidden transition-all duration-200",
                    isOpen
                      ? "max-h-[500px] opacity-100"
                      : "max-h-0 opacity-0",
                  )}
                >
                  <p className="px-1 pb-4 pt-1 text-sm text-fg-3">
                    {item.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
