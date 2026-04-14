import { Star } from "lucide-react";

interface StepConfigureFantasyProps {
  connected: boolean;
  onConnect: () => void;
}

export default function StepConfigureFantasy({ connected, onConnect }: StepConfigureFantasyProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-14 h-14 rounded-xl bg-purple-500/10 flex items-center justify-center">
        <Star size={28} className="text-purple-400" />
      </div>

      {connected ? (
        <div className="text-center">
          <p className="text-sm font-medium text-success">Yahoo Connected</p>
          <p className="text-xs text-fg-4 mt-1">
            Your leagues will sync automatically.
          </p>
        </div>
      ) : (
        <>
          <div className="text-center">
            <p className="text-sm text-fg-2">
              Connect your Yahoo account to import your fantasy leagues.
            </p>
            <p className="text-xs text-fg-4 mt-1">
              You can also do this later from Settings.
            </p>
          </div>
          <button
            onClick={onConnect}
            className="px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition-colors"
          >
            Connect Yahoo
          </button>
        </>
      )}
    </div>
  );
}
