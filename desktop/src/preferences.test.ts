/**
 * Tests for the Display-page venue-toggle migration helpers.
 *
 * These lock in the contract that lets us upgrade user prefs in place:
 *  - legacy boolean `true`  becomes `"both"` (visible everywhere — preserves
 *    the old behaviour where a true boolean meant "show this")
 *  - legacy boolean `false` becomes `"off"`  (hidden everywhere — preserves
 *    the old behaviour where a false boolean meant "hide this")
 *  - legacy `tickerShowMatchup` and `showInjuryCount` booleans on Fantasy
 *    fold into their new venue-aware replacements without losing the user's
 *    prior on/off choice
 *  - unknown / corrupt values fall back to `"both"` so loadPrefs never
 *    throws or produces a bad shape
 */
import { describe, it, expect } from "vitest";
import {
  migrateVenue,
  shouldShowOnFeed,
  shouldShowOnTicker,
  enumToBools,
  boolsToEnum,
  migrateFinanceDisplay,
  migrateRssDisplay,
  migrateFantasyDisplay,
} from "./preferences";
import type { Venue } from "./preferences";

describe("migrateVenue", () => {
  it("keeps valid venue strings as-is", () => {
    expect(migrateVenue("off")).toBe("off");
    expect(migrateVenue("feed")).toBe("feed");
    expect(migrateVenue("both")).toBe("both");
    expect(migrateVenue("ticker")).toBe("ticker");
  });

  it("coerces legacy true to 'both'", () => {
    expect(migrateVenue(true)).toBe("both");
  });

  it("coerces legacy false to 'off'", () => {
    expect(migrateVenue(false)).toBe("off");
  });

  it("falls back to 'both' for unknown values (new / never-set fields are visible)", () => {
    expect(migrateVenue("nonsense")).toBe("both");
    expect(migrateVenue(42)).toBe("both");
    expect(migrateVenue(null)).toBe("both");
    expect(migrateVenue(undefined)).toBe("both");
  });
});

describe("shouldShowOnFeed / shouldShowOnTicker", () => {
  it("routes each venue to the correct surface", () => {
    expect(shouldShowOnFeed("off")).toBe(false);
    expect(shouldShowOnFeed("feed")).toBe(true);
    expect(shouldShowOnFeed("both")).toBe(true);
    expect(shouldShowOnFeed("ticker")).toBe(false);

    expect(shouldShowOnTicker("off")).toBe(false);
    expect(shouldShowOnTicker("feed")).toBe(false);
    expect(shouldShowOnTicker("both")).toBe(true);
    expect(shouldShowOnTicker("ticker")).toBe(true);
  });
});

describe("enumToBools / boolsToEnum (DisplayLocationGrid adapter)", () => {
  // The two-checkbox grid component reads via enumToBools and writes back
  // via boolsToEnum. Drift between these two functions would silently
  // corrupt user prefs on every interaction, so the test pins down all
  // four cases explicitly AND confirms a round trip is identity.

  it("enumToBools — off maps to {feed: false, ticker: false}", () => {
    expect(enumToBools("off")).toEqual({ feed: false, ticker: false });
  });

  it("enumToBools — feed maps to {feed: true, ticker: false}", () => {
    expect(enumToBools("feed")).toEqual({ feed: true, ticker: false });
  });

  it("enumToBools — ticker maps to {feed: false, ticker: true}", () => {
    expect(enumToBools("ticker")).toEqual({ feed: false, ticker: true });
  });

  it("enumToBools — both maps to {feed: true, ticker: true}", () => {
    expect(enumToBools("both")).toEqual({ feed: true, ticker: true });
  });

  it("boolsToEnum — false/false maps to off", () => {
    expect(boolsToEnum(false, false)).toBe("off");
  });

  it("boolsToEnum — true/false maps to feed", () => {
    expect(boolsToEnum(true, false)).toBe("feed");
  });

  it("boolsToEnum — false/true maps to ticker", () => {
    expect(boolsToEnum(false, true)).toBe("ticker");
  });

  it("boolsToEnum — true/true maps to both", () => {
    expect(boolsToEnum(true, true)).toBe("both");
  });

  it("round-trip: enumToBools → boolsToEnum is the identity for every Venue", () => {
    const venues: Venue[] = ["off", "feed", "ticker", "both"];
    for (const v of venues) {
      const { feed, ticker } = enumToBools(v);
      expect(boolsToEnum(feed, ticker)).toBe(v);
    }
  });

  it("round-trip: boolsToEnum → enumToBools is the identity for every (feed, ticker) pair", () => {
    for (const feed of [false, true]) {
      for (const ticker of [false, true]) {
        const venue = boolsToEnum(feed, ticker);
        expect(enumToBools(venue)).toEqual({ feed, ticker });
      }
    }
  });
});

describe("migrateFinanceDisplay", () => {
  it("upgrades legacy boolean fields to Venue", () => {
    // Pretend the stored prefs still use booleans. We type-cast through
    // `unknown` because the interface changed shape; the whole POINT of
    // the migration function is tolerating this.
    const legacy = {
      showChange: true,
      showPrevClose: false,
      showLastUpdated: true,
      defaultSort: "change",
    } as unknown as Parameters<typeof migrateFinanceDisplay>[0];

    const migrated = migrateFinanceDisplay(legacy);

    expect(migrated.showChange).toBe("both");
    expect(migrated.showPrevClose).toBe("off");
    expect(migrated.showLastUpdated).toBe("both");
    expect(migrated.defaultSort).toBe("change"); // preserved
  });

  it("returns defaults for a completely empty input", () => {
    const migrated = migrateFinanceDisplay({});
    // Unknown → "both" per migrateVenue's fallback.
    expect(migrated.showChange).toBe("both");
    expect(migrated.showPrevClose).toBe("both");
    expect(migrated.showLastUpdated).toBe("both");
    expect(migrated.defaultSort).toBe("alpha");
  });

  it("gracefully handles undefined input", () => {
    const migrated = migrateFinanceDisplay(undefined);
    expect(migrated.defaultSort).toBe("alpha");
    expect(migrated.showChange).toBe("both");
  });

  it("keeps new-shape Venue values unchanged (idempotent re-run)", () => {
    const current = {
      showChange: "both",
      showPrevClose: "feed",
      showLastUpdated: "ticker",
      defaultSort: "change",
    } as Parameters<typeof migrateFinanceDisplay>[0];

    const migrated = migrateFinanceDisplay(current);

    expect(migrated.showChange).toBe("both");
    expect(migrated.showPrevClose).toBe("feed");
    expect(migrated.showLastUpdated).toBe("ticker");
    expect(migrated.defaultSort).toBe("change");
  });
});

describe("migrateRssDisplay", () => {
  it("upgrades legacy boolean fields to Venue", () => {
    const legacy = {
      showDescription: true,
      showSource: false,
      showTimestamps: true,
      articlesPerSource: 3,
    } as unknown as Parameters<typeof migrateRssDisplay>[0];

    const migrated = migrateRssDisplay(legacy);

    expect(migrated.showDescription).toBe("both");
    expect(migrated.showSource).toBe("off");
    expect(migrated.showTimestamps).toBe("both");
    expect(migrated.articlesPerSource).toBe(3);
  });

  it("preserves articlesPerSource and uses 'both' for missing venue fields", () => {
    const migrated = migrateRssDisplay({ articlesPerSource: 7 });
    expect(migrated.articlesPerSource).toBe(7);
    expect(migrated.showSource).toBe("both");
  });

  it("falls back to default for non-number articlesPerSource", () => {
    const migrated = migrateRssDisplay({
      articlesPerSource: "lots",
    } as unknown as Parameters<typeof migrateRssDisplay>[0]);
    expect(migrated.articlesPerSource).toBe(4);
  });
});

describe("migrateFantasyDisplay", () => {
  it("folds legacy tickerShowMatchup=true into matchupScore='both'", () => {
    const legacy = { tickerShowMatchup: true } as unknown as Parameters<
      typeof migrateFantasyDisplay
    >[0];
    const migrated = migrateFantasyDisplay(legacy);
    expect(migrated.matchupScore).toBe("both");
  });

  it("folds legacy tickerShowMatchup=false into matchupScore='feed'", () => {
    // Rationale: user explicitly hid the matchup from the ticker but had no
    // way to hide it from the feed under the old model. Keep it visible in
    // the feed after migration so no feed-page content disappears silently.
    const legacy = { tickerShowMatchup: false } as unknown as Parameters<
      typeof migrateFantasyDisplay
    >[0];
    const migrated = migrateFantasyDisplay(legacy);
    expect(migrated.matchupScore).toBe("feed");
  });

  it("folds legacy showInjuryCount boolean into injuryCount venue", () => {
    expect(
      migrateFantasyDisplay({ showInjuryCount: true } as unknown as Parameters<
        typeof migrateFantasyDisplay
      >[0]).injuryCount,
    ).toBe("both");
    expect(
      migrateFantasyDisplay({ showInjuryCount: false } as unknown as Parameters<
        typeof migrateFantasyDisplay
      >[0]).injuryCount,
    ).toBe("off");
  });

  it("preserves feed-layout booleans (showStandings, showMatchups)", () => {
    const migrated = migrateFantasyDisplay({
      showStandings: false,
      showMatchups: true,
    });
    expect(migrated.showStandings).toBe(false);
    expect(migrated.showMatchups).toBe(true);
  });

  it("preserves non-venue scalar fields", () => {
    const migrated = migrateFantasyDisplay({
      defaultSubTab: "matchup",
      defaultSort: "record",
      enabledLeagueKeys: ["nfl.l.12345"],
      primaryLeagueKey: "nfl.l.12345",
    });

    expect(migrated.defaultSubTab).toBe("matchup");
    expect(migrated.defaultSort).toBe("record");
    expect(migrated.enabledLeagueKeys).toEqual(["nfl.l.12345"]);
    expect(migrated.primaryLeagueKey).toBe("nfl.l.12345");
  });

  it("new-shape venue fields survive migration unchanged", () => {
    const current = {
      matchupScore: "ticker",
      winProbability: "feed",
      matchupStatus: "off",
      projectedPoints: "both",
      week: "ticker",
      record: "feed",
      standingsPosition: "both",
      streak: "off",
      injuryCount: "feed",
      topScorer: "ticker",
    } as Parameters<typeof migrateFantasyDisplay>[0];
    const migrated = migrateFantasyDisplay(current);
    expect(migrated.matchupScore).toBe("ticker");
    expect(migrated.winProbability).toBe("feed");
    expect(migrated.matchupStatus).toBe("off");
    expect(migrated.projectedPoints).toBe("both");
    expect(migrated.streak).toBe("off");
    expect(migrated.topScorer).toBe("ticker");
  });

  it("legacy tickerShowMatchup is dropped from the returned object", () => {
    const migrated = migrateFantasyDisplay({
      tickerShowMatchup: true,
    } as unknown as Parameters<typeof migrateFantasyDisplay>[0]);
    // @ts-expect-error — legacy key shouldn't exist on the migrated shape
    expect(migrated.tickerShowMatchup).toBeUndefined();
  });

  it("new-shape value wins over legacy boolean when both are present", () => {
    // A user whose prefs file was partially migrated (new key set, old key
    // still present) should not regress to the legacy value.
    const migrated = migrateFantasyDisplay({
      tickerShowMatchup: false,
      matchupScore: "ticker",
    } as unknown as Parameters<typeof migrateFantasyDisplay>[0]);
    expect(migrated.matchupScore).toBe("ticker");
  });

  it("Phase 1 player-stats fields default to 'both' for upgrading users", () => {
    // A user upgrading from a build that predates these fields will have
    // no key for them in their prefs file. migrateVenue's unknown-input
    // fallback returns "both" — fields appear visible-everywhere by
    // default, matching what users have been asking for ("when can we
    // see player stats on the ticker?").
    const migrated = migrateFantasyDisplay({});
    expect(migrated.topThreeScorers).toBe("both");
    expect(migrated.worstStarter).toBe("both");
    expect(migrated.benchOpportunity).toBe("both");
    expect(migrated.injuryDetail).toBe("both");
  });

  it("Phase 1 player-stats fields preserve user choices on subsequent loads", () => {
    const migrated = migrateFantasyDisplay({
      topThreeScorers: "ticker",
      worstStarter: "feed",
      benchOpportunity: "off",
      injuryDetail: "both",
    });
    expect(migrated.topThreeScorers).toBe("ticker");
    expect(migrated.worstStarter).toBe("feed");
    expect(migrated.benchOpportunity).toBe("off");
    expect(migrated.injuryDetail).toBe("both");
  });
});
