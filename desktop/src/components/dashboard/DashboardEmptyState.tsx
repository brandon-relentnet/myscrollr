/**
 * DashboardEmptyState — shared empty/loading state for dashboard summary cards.
 *
 * Renders a short message with an optional action button, matching the
 * consistent styling used across all 8 dashboard summary components.
 */

interface DashboardEmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function DashboardEmptyState({
  message,
  actionLabel,
  onAction,
}: DashboardEmptyStateProps) {
  return (
    <div className="flex flex-col gap-2 py-1">
      <p className="text-[11px] text-fg-4">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors self-start"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
