import { describe, it, expect } from "vitest";
import {
  buildYahooLeagueUrl,
  buildYahooPlayerUrl,
  chipUrlForFinance,
  chipUrlForSports,
  chipUrlForRss,
} from "./chipUrl";

describe("buildYahooLeagueUrl", () => {
  // ── Canonical mapping cases (no explicit gameCode) ──
  // The function uses the league_key prefix when the explicit gameCode
  // arg is not supplied. Yahoo's URL slugs differ from the game codes
  // in some cases (NFL → "f1", NHL → "hockey").

  it("constructs a football league URL from an NFL league_key", () => {
    expect(buildYahooLeagueUrl("nfl.l.420")).toBe(
      "https://football.fantasysports.yahoo.com/f1/420",
    );
  });

  it("constructs a basketball league URL from an NBA league_key", () => {
    expect(buildYahooLeagueUrl("nba.l.12345")).toBe(
      "https://basketball.fantasysports.yahoo.com/nba/12345",
    );
  });

  it("constructs a hockey league URL from an NHL league_key", () => {
    expect(buildYahooLeagueUrl("nhl.l.78")).toBe(
      "https://hockey.fantasysports.yahoo.com/hockey/78",
    );
  });

  it("constructs a baseball league URL from an MLB league_key", () => {
    expect(buildYahooLeagueUrl("mlb.l.999")).toBe(
      "https://baseball.fantasysports.yahoo.com/mlb/999",
    );
  });

  // ── Production case: numeric Yahoo game id prefix ──
  // Real Yahoo league_keys in production use numeric game ids, e.g.
  // "469.l.35099" for an NFL 2026 league. Without the explicit
  // gameCode arg we can't determine the sport.

  it("falls back to generic Yahoo Fantasy hub when prefix is numeric and gameCode missing", () => {
    expect(buildYahooLeagueUrl("469.l.35099")).toBe(
      "https://sports.yahoo.com/fantasy/",
    );
  });

  it("uses explicit gameCode to override numeric prefix (the production path)", () => {
    expect(buildYahooLeagueUrl("469.l.35099", "nfl")).toBe(
      "https://football.fantasysports.yahoo.com/f1/35099",
    );
  });

  it("uses explicit gameCode for NBA numeric prefix", () => {
    expect(buildYahooLeagueUrl("428.l.99999", "nba")).toBe(
      "https://basketball.fantasysports.yahoo.com/nba/99999",
    );
  });

  it("falls back to Yahoo Fantasy hub for unknown gameCode", () => {
    expect(buildYahooLeagueUrl("xyz.l.1")).toBe(
      "https://sports.yahoo.com/fantasy/",
    );
  });

  it("returns undefined when league_key cannot be parsed", () => {
    expect(buildYahooLeagueUrl("not-a-key")).toBeUndefined();
  });
});

describe("buildYahooPlayerUrl", () => {
  it("constructs an NFL player URL from a player_key", () => {
    expect(buildYahooPlayerUrl("nfl.p.30977")).toBe(
      "https://sports.yahoo.com/nfl/players/30977/",
    );
  });

  it("constructs an MLB player URL", () => {
    expect(buildYahooPlayerUrl("mlb.p.10001")).toBe(
      "https://sports.yahoo.com/mlb/players/10001/",
    );
  });

  it("uses explicit gameCode to override numeric prefix (the production path)", () => {
    expect(buildYahooPlayerUrl("469.p.30977", "nfl")).toBe(
      "https://sports.yahoo.com/nfl/players/30977/",
    );
  });

  it("falls back to Yahoo Sports hub when prefix is numeric and gameCode missing", () => {
    expect(buildYahooPlayerUrl("469.p.30977")).toBe(
      "https://sports.yahoo.com/",
    );
  });

  it("returns undefined when player_key cannot be parsed", () => {
    expect(buildYahooPlayerUrl("nfl-p-30977")).toBeUndefined();
  });

  it("falls back to Yahoo Sports hub for unknown gameCode", () => {
    expect(buildYahooPlayerUrl("xyz.p.99")).toBe(
      "https://sports.yahoo.com/",
    );
  });
});

describe("chipUrlForFinance", () => {
  it("returns the trade.link when populated", () => {
    expect(chipUrlForFinance({ link: "https://www.google.com/finance/quote/AAPL:NASDAQ" } as never)).toBe(
      "https://www.google.com/finance/quote/AAPL:NASDAQ",
    );
  });

  it("returns undefined when link is empty", () => {
    expect(chipUrlForFinance({ link: "" } as never)).toBeUndefined();
  });

  it("returns undefined when link is missing", () => {
    expect(chipUrlForFinance({} as never)).toBeUndefined();
  });
});

describe("chipUrlForSports", () => {
  it("returns the game.link when populated", () => {
    expect(chipUrlForSports({ link: "https://www.espn.com/nfl/game/_/gameId/123" } as never)).toBe(
      "https://www.espn.com/nfl/game/_/gameId/123",
    );
  });

  // ── New: fallback URL construction when game.link is empty/null ──
  // api-sports.io doesn't supply per-game URLs, so the helper has to
  // build something useful from league + sport + team names.

  it("returns ESPN scoreboard for known NFL sport key when link is empty", () => {
    expect(chipUrlForSports({
      link: "",
      sport: "nfl",
      league: "NFL",
      home_team_name: "Chiefs",
      away_team_name: "Bills",
    } as never)).toBe(
      "https://www.espn.com/nfl/scoreboard",
    );
  });

  it("returns Formula 1 official results page for F1 league", () => {
    expect(chipUrlForSports({
      link: "",
      sport: "",
      league: "Formula 1",
      home_team_name: "Las Vegas Grand Prix",
      away_team_name: "",
    } as never)).toBe(
      "https://www.formula1.com/en/results.html",
    );
  });

  it("returns Premier League results page for EPL league", () => {
    expect(chipUrlForSports({
      link: "",
      league: "Premier League",
      home_team_name: "Arsenal",
      away_team_name: "Chelsea",
    } as never)).toBe(
      "https://www.premierleague.com/results",
    );
  });

  it("falls back to Google search of teams + league when nothing else matches", () => {
    expect(chipUrlForSports({
      link: "",
      sport: "",
      league: "Some Niche League",
      home_team_name: "Team A",
      away_team_name: "Team B",
    } as never)).toMatch(
      /^https:\/\/www\.google\.com\/search\?q=Team%20A%20vs%20Team%20B%20Some%20Niche%20League/,
    );
  });

  it("returns undefined when link is empty AND no league/team info", () => {
    expect(chipUrlForSports({ link: "" } as never)).toBeUndefined();
  });
});

describe("chipUrlForRss", () => {
  it("returns the item.link when populated", () => {
    expect(chipUrlForRss({ link: "https://example.com/article/1" } as never)).toBe(
      "https://example.com/article/1",
    );
  });

  it("returns undefined when link is empty", () => {
    expect(chipUrlForRss({ link: "" } as never)).toBeUndefined();
  });
});
