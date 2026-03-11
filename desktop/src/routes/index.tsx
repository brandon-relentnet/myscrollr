/**
 * Index route — welcome / empty state.
 *
 * Shown when no source is selected (first launch, or after removing
 * all channels and widgets).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
      <h2 className="text-base font-semibold text-fg">Welcome to Scrollr</h2>
      <p className="text-sm text-fg-3 leading-relaxed">
        Add a channel or enable a widget from the sidebar to get started.
      </p>
    </div>
  );
}
