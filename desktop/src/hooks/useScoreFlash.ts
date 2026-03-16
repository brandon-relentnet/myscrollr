/**
 * Shared hook for score-change flash animation.
 *
 * Detects when a game's score changes and returns `true` for 800ms,
 * allowing components to show a brief highlight flash. Skips the
 * flash on initial mount so it only fires on live updates.
 */
import { useState, useEffect, useRef } from "react";

export function useScoreFlash(
  awayScore: number | string,
  homeScore: number | string,
): boolean {
  const prevRef = useRef({ away: awayScore, home: homeScore });
  const [flash, setFlash] = useState(false);
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      prevRef.current = { away: awayScore, home: homeScore };
      return;
    }

    const prev = prevRef.current;
    if (prev.away !== awayScore || prev.home !== homeScore) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      prevRef.current = { away: awayScore, home: homeScore };
      return () => clearTimeout(t);
    }
  }, [awayScore, homeScore]);

  return flash;
}
