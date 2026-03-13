/**
 * Shared error boundary component for route-level errors.
 *
 * Displays the error message and a retry button that resets
 * the TanStack Router error boundary.
 */
import type { ErrorComponentProps } from "@tanstack/react-router";

export default function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
      <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center mb-1">
        <span className="text-error text-lg font-bold">!</span>
      </div>
      <h2 className="text-base font-semibold text-fg">Something went wrong</h2>
      <p className="text-sm text-fg-3 leading-relaxed">{error.message}</p>
      <button
        onClick={reset}
        className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium bg-surface-3/50 hover:bg-surface-3 text-fg-3 hover:text-fg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
