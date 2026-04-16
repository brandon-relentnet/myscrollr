import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
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
    <div className="flex flex-col h-full">
      {/* Back button + section title */}
      <div className="shrink-0 px-6 pt-4 pb-2">
        <button
          onClick={() => setActiveSection(null)}
          className="flex items-center gap-1.5 text-sm text-fg-3 hover:text-fg-2 transition-colors mb-2 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Support
        </button>
        <h1 className="text-lg font-bold text-fg">
          {SECTION_TITLES[activeSection]}
        </h1>
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
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
