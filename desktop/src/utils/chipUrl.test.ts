import { describe, it, expect } from "vitest";
import {
  buildYahooLeagueUrl,
  buildYahooPlayerUrl,
  chipUrlForFinance,
  chipUrlForSports,
  chipUrlForRss,
} from "./chipUrl";

describe("buildYahooLeagueUrl", () => {
  it("constructs a football league URL from an NFL league_key", () => {
    expect(buildYahooLeagueUrl("nfl.l.420")).toBe(
      "https://football.fantasysports.yahoo.com/nfl/420",
    );
  });

  it("constructs a basketball league URL from an NBA league_key", () => {
    expect(buildYahooLeagueUrl("nba.l.12345")).toBe(
      "https://basketball.fantasysports.yahoo.com/nba/12345",
    );
  });

  it("constructs a hockey league URL from an NHL league_key", () => {
    expect(buildYahooLeagueUrl("nhl.l.78")).toBe(
      "https://hockey.fantasysports.yahoo.com/nhl/78",
    );
  });

  it("constructs a baseball league URL from an MLB league_key", () => {
    expect(buildYahooLeagueUrl("mlb.l.999")).toBe(
      "https://baseball.fantasysports.yahoo.com/mlb/999",
    );
  });

  it("returns undefined for an unrecognized game_code prefix", () => {
    expect(buildYahooLeagueUrl("xyz.l.1")).toBeUndefined();
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

  it("returns undefined when player_key cannot be parsed", () => {
    expect(buildYahooPlayerUrl("nfl-p-30977")).toBeUndefined();
  });

  it("returns undefined for an unrecognized game_code prefix", () => {
    expect(buildYahooPlayerUrl("xyz.p.99")).toBeUndefined();
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

  it("returns undefined when link is empty", () => {
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
