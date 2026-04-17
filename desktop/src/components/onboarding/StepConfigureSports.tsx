import clsx from "clsx";
import { POPULAR_LEAGUES } from "./curated-picks";

interface StepConfigureSportsProps {
  selected: Set<string>;
  onToggle: (leagueName: string) => void;
}

export default function StepConfigureSports({ selected, onToggle }: StepConfigureSportsProps) {
  const grouped = POPULAR_LEAGUES.reduce<Record<string, typeof POPULAR_LEAGUES>>((acc, l) => {
    (acc[l.sport] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([sport, leagues]) => (
        <div key={sport}>
          <h3 className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-2">{sport}</h3>
          <div className="flex flex-col gap-1.5">
            {leagues.map((league) => {
              const active = selected.has(league.name);
              return (
                <button
                  key={league.name}
                  onClick={() => onToggle(league.name)}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                    active
                      ? "border-accent bg-accent/5"
                      : "border-edge bg-surface-2/50 hover:border-fg-4",
                  )}
                >
                  <div
                    className={clsx(
                      "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      active ? "border-accent bg-accent" : "border-fg-4",
                    )}
                  >
                    {active && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-fg">{league.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
