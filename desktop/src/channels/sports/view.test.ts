import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectSportsForTicker, gameEngagement } from "./view";
import type { SportsDisplayConfig } from "./view";
import type { Game } from "../../types";

// ── Fixtures ────────────────────────────────────────────────────

// Fix "now" so time-based engagement is deterministic.
const NOW = new Date("2026-06-01T12:00:00Z");

function mk(overrides: Partial<Game> & { id: number; state?: string }): Game {
  const defaults: Game = {
    id: overrides.id,
    league: "NFL",
    sport: "american-football",
    external_game_id: `ext-${overrides.id}`,
    link: `https://example.com/${overrides.id}`,
    home_team_name: "Home",
    home_team_logo: "",
    home_team_score: 0,
    home_team_code: "HOM",
    away_team_name: "Away",
    away_team_logo: "",
    away_team_score: 0,
    away_team_code: "AWY",
    start_time: NOW.toISOString(),
    state: "pre",
  };
  return { ...defaults, ...overrides };
}

function preGame(id: number, startInMs: number): Game {
  return mk({
    id,
    state: "pre",
    start_time: new Date(NOW.getTime() + startInMs).toISOString(),
  });
}

function liveGame(id: number, closeScoreDiff = 10): Game {
  return mk({
    id,
    state: "in_progress",
    home_team_score: 20 + closeScoreDiff,
    away_team_score: 20,
    start_time: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
  });
}

function finalGame(id: number, finishedAgoMs: number): Game {
  return mk({
    id,
    state: "final",
    home_team_score: 28,
    away_team_score: 21,
    start_time: new Date(NOW.getTime() - finishedAgoMs).toISOString(),
  });
}

// ── Setup ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── gameEngagement ──────────────────────────────────────────────

describe("gameEngagement", () => {
  it("returns 100 for live + close game", () => {
    // basketball close threshold = 6
    const g = mk({
      id: 1,
      state: "in_progress",
      sport: "basketball",
      home_team_score: 60,
      away_team_score: 58,
    });
    expect(gameEngagement(g)).toBe(100);
  });

  it("returns 80 for live but not close", () => {
    const g = mk({
      id: 1,
      state: "in_progress",
      sport: "basketball",
      home_team_score: 80,
      away_team_score: 50,
    });
    expect(gameEngagement(g)).toBe(80);
  });

  it("returns 60 for pre-game within 1 hour", () => {
    expect(gameEngagement(preGame(1, 30 * 60_000))).toBe(60);
  });

  it("returns 40 for pre-game within 24 hours", () => {
    expect(gameEngagement(preGame(1, 6 * 3_600_000))).toBe(40);
  });

  it("returns 20 for pre-game more than 24 hours away", () => {
    expect(gameEngagement(preGame(1, 48 * 3_600_000))).toBe(20);
  });

  it("returns 30 for final within 2 hours", () => {
    expect(gameEngagement(finalGame(1, 30 * 60_000))).toBe(30);
  });

  it("returns 10 for final more than 2 hours ago", () => {
    expect(gameEngagement(finalGame(1, 5 * 3_600_000))).toBe(10);
  });

  it("returns 0 for games in unknown states", () => {
    expect(gameEngagement(mk({ id: 1, state: "postponed" }))).toBe(0);
  });
});

// ── selectSportsForTicker ───────────────────────────────────────

describe("selectSportsForTicker", () => {
  it("sorts by engagement score, live games first", () => {
    const games = [
      preGame(1, 12 * 3_600_000),   // score 40
      liveGame(2),                   // score 80
      finalGame(3, 30 * 60_000),     // score 30
    ];
    const result = selectSportsForTicker(games, null);
    expect(result.map((g) => g.id)).toEqual([2, 1, 3]);
  });

  it("defaults to show both upcoming and final when config is null", () => {
    const games = [preGame(1, 10 * 60_000), finalGame(2, 60 * 60_000)];
    const result = selectSportsForTicker(games, null);
    expect(result).toHaveLength(2);
  });

  it("defaults to show both upcoming and final when config is undefined", () => {
    const games = [preGame(1, 10 * 60_000), finalGame(2, 60 * 60_000)];
    const result = selectSportsForTicker(games, undefined);
    expect(result).toHaveLength(2);
  });

  it("hides upcoming games when showUpcoming=false", () => {
    const games = [
      preGame(1, 10 * 60_000),
      liveGame(2),
      finalGame(3, 60 * 60_000),
    ];
    const config: SportsDisplayConfig = { showUpcoming: false };
    const result = selectSportsForTicker(games, config);
    expect(result.map((g) => g.id)).toEqual([2, 3]);
  });

  it("hides final games when showFinal=false", () => {
    const games = [
      preGame(1, 10 * 60_000),
      liveGame(2),
      finalGame(3, 60 * 60_000),
    ];
    const config: SportsDisplayConfig = { showFinal: false };
    const result = selectSportsForTicker(games, config);
    expect(result.map((g) => g.id)).toEqual([2, 1]);
  });

  it("can hide both upcoming and final at once (live only)", () => {
    const games = [
      preGame(1, 10 * 60_000),
      liveGame(2),
      finalGame(3, 60 * 60_000),
    ];
    const result = selectSportsForTicker(games, {
      showUpcoming: false,
      showFinal: false,
    });
    expect(result.map((g) => g.id)).toEqual([2]);
  });

  it("returns [] for empty input", () => {
    expect(selectSportsForTicker([], null)).toEqual([]);
  });
});
