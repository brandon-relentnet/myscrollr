import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import SupportHub from "../components/support/SupportHub";
import GettingStartedSection from "../components/support/GettingStartedSection";
import FAQSection from "../components/support/FAQSection";
import TroubleshootingSection from "../components/support/TroubleshootingSection";
import FeatureGuidesSection from "../components/support/FeatureGuidesSection";
import BillingHelpSection from "../components/support/BillingHelpSection";
import ContactForm from "../components/support/ContactForm";
import type { SectionId } from "../components/support/SupportHub";

export const Route = createFileRoute("/support")({ component: SupportPage });

const SECTION_TITLES: Record<SectionId, string> = {
  "getting-started": "Getting Started",
  faq: "Frequently Asked Questions",
  troubleshooting: "Troubleshooting",
  guides: "Feature Guides",
  billing: "Account & Billing",
  contact: "Contact Us",
};

function SupportPage() {
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  if (!activeSection) {
    return <SupportHub onSelectSection={setActiveSection} />;
  }

  return (
    <div className="p-5 max-w-6xl mx-auto">
      {/* Breadcrumb header */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider mb-1">
          <button
            onClick={() => setActiveSection(null)}
            className="text-fg-4 hover:text-fg-3 transition-colors cursor-pointer uppercase"
          >
            Support
          </button>
          <span className="text-fg-4">/</span>
          <span className="text-fg-4">
            {SECTION_TITLES[activeSection]}
          </span>
        </div>
        <p className="text-xs text-fg-4">
          {activeSection === "contact"
            ? "Report bugs, request features, or send feedback"
            : "Get help, find answers, and contact us"}
        </p>
      </div>

      {/* Section content */}
      <div>
        {activeSection === "getting-started" && <GettingStartedSection />}
        {activeSection === "faq" && <FAQSection />}
        {activeSection === "troubleshooting" && <TroubleshootingSection />}
        {activeSection === "guides" && <FeatureGuidesSection />}
        {activeSection === "billing" && <BillingHelpSection />}
        {activeSection === "contact" && (
          <ContactForm onBack={() => setActiveSection(null)} />
        )}
      </div>
    </div>
  );
}
