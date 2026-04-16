/**
 * Support route — hub for bug reports and customer support.
 *
 * Two views:
 *   Cards — choose between "Report a Bug" and "Contact Us"
 *   Form  — inline bug report form with diagnostics
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Bug, Mail } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import BugReportForm from "../components/support/BugReportForm";

// ── Route ────────────────────────────────────────────────────────

export const Route = createFileRoute("/support")({
  component: SupportPage,
});

// ── Component ────────────────────────────────────────────────────

function SupportPage() {
  const [view, setView] = useState<"cards" | "form">("cards");

  if (view === "form") {
    return <BugReportForm onBack={() => setView("cards")} />;
  }

  return (
    <div className="p-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy size={14} className="text-fg-3" />
          <h1 className="text-[11px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
            Support
          </h1>
        </div>
        <p className="text-xs text-fg-4">
          Get help and report issues
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Report a Bug */}
        <button
          onClick={() => setView("form")}
          className="bg-surface-2 border border-edge/30 rounded-xl p-6 hover:border-edge/50 transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
              <Bug size={16} className="text-accent" />
            </div>
            <h2 className="text-sm font-semibold text-fg">Report a Bug</h2>
          </div>
          <p className="text-xs text-fg-3 leading-relaxed">
            Something not working? Let us know with details and we&apos;ll
            automatically include diagnostics.
          </p>
        </button>

        {/* Contact Us */}
        <div className="bg-surface-2 border border-edge/30 rounded-xl p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-info/10">
              <Mail size={16} className="text-info" />
            </div>
            <h2 className="text-sm font-semibold text-fg">Contact Us</h2>
          </div>
          <p className="text-xs text-fg-3 leading-relaxed mb-4">
            Questions about your account, billing, or anything else?
          </p>
          <p className="text-[11px] font-mono text-fg-4 mb-3">
            support@myscrollr.com
          </p>
          <button
            onClick={() => open("mailto:support@myscrollr.com")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-hover text-fg-2 hover:text-fg transition-colors cursor-pointer"
          >
            Send Email
          </button>
        </div>
      </div>
    </div>
  );
}
