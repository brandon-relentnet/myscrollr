import { LogIn, LayoutGrid, Settings, Monitor, Puzzle, Zap } from "lucide-react";
import { GETTING_STARTED_STEPS } from "./support-content";

const ICONS: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  LogIn,
  LayoutGrid,
  Settings,
  Monitor,
  Puzzle,
  Zap,
};

export default function GettingStartedSection() {
  // Wrapped in the shared dense-card chrome so the numbered timeline
  // reads as a single cohesive panel instead of a free-floating list.
  return (
    <div className="rounded-xl border border-edge/35 bg-base-150/35 p-4 space-y-4">
      {GETTING_STARTED_STEPS.map((step, i) => {
        const Icon = ICONS[step.iconName];
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-ui-body font-bold text-accent">
              {i + 1}
            </div>
            {Icon && (
              <div className="mt-1 shrink-0">
                <Icon size={18} className="text-accent" />
              </div>
            )}
            <div>
              <p className="text-ui-body font-semibold">{step.title}</p>
              <p className="mt-0.5 text-ui-meta">{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
