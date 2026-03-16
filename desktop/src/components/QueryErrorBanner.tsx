/**
 * Inline error banner for failed TanStack Query refreshes.
 *
 * Renders nothing when error is null, otherwise shows a compact
 * mono-spaced error message in the standard error color scheme.
 */

interface QueryErrorBannerProps {
  error: Error | null;
}

export default function QueryErrorBanner({ error }: QueryErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="px-2 py-1.5 text-[11px] font-mono text-error/80 bg-error/5 border border-error/15 rounded">
      Failed to refresh: {error.message}
    </div>
  );
}
