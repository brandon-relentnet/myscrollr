/**
 * Index route — redirects to /feed.
 *
 * The feed dashboard is the default landing page.
 * This route exists only as a fallback; __root.tsx also handles
 * the redirect via useEffect for faster navigation.
 */
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  return <Navigate to="/feed" />;
}
