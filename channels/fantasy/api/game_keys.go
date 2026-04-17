package main

import (
	"context"
	"encoding/xml"
	"fmt"
	"log"
	"strconv"
	"sync"
)

// =============================================================================
// Yahoo Fantasy Game Key Mapping
//
// Yahoo assigns a unique integer "game key" to each sport + season combination.
// These are used to construct API URLs like:
//   .../users;use_login=1/games;game_keys=449/leagues
//
// Source: https://fantasysports.yahooapis.com/fantasy/v2/games;game_codes=mlb;seasons=2001,2002
// Ported from yahoofantasy v1.4.9 (yahoofantasy/api/games.py)
// =============================================================================

// gameKeys maps gameCode -> season -> Yahoo game key.
var gameKeys = map[string]map[int]int{
	"mlb": {
		2001: 12, 2002: 39, 2003: 74, 2004: 98, 2005: 113,
		2006: 147, 2007: 171, 2008: 195, 2009: 215, 2010: 238,
		2011: 253, 2012: 268, 2013: 308, 2014: 328, 2015: 346,
		2016: 357, 2017: 370, 2018: 378, 2019: 388, 2020: 398,
		2021: 404, 2022: 412, 2023: 422, 2024: 431, 2025: 458,
	},
	"nfl": {
		2001: 57, 2002: 49, 2003: 79, 2004: 101, 2005: 124,
		2006: 153, 2007: 175, 2008: 199, 2009: 222, 2010: 242,
		2011: 257, 2012: 273, 2013: 314, 2014: 331, 2015: 348,
		2016: 359, 2017: 371, 2018: 380, 2019: 390, 2020: 399,
		2021: 406, 2022: 414, 2023: 423, 2024: 449, 2025: 461,
	},
	"nba": {
		2001: 16, 2002: 67, 2003: 95, 2004: 112, 2005: 131,
		2006: 165, 2007: 187, 2008: 211, 2009: 234, 2010: 249,
		2011: 265, 2012: 304, 2013: 322, 2014: 342, 2015: 353,
		2016: 364, 2017: 375, 2018: 385, 2019: 395, 2020: 402,
		2021: 410, 2022: 418, 2023: 428, 2024: 454, 2025: 466,
	},
	"nhl": {
		2001: 15, 2002: 64, 2003: 94, 2004: 111, 2005: 130,
		2006: 164, 2007: 186, 2008: 210, 2009: 233, 2010: 248,
		2011: 263, 2012: 303, 2013: 321, 2014: 341, 2015: 352,
		2016: 363, 2017: 376, 2018: 386, 2019: 396, 2020: 403,
		2021: 411, 2022: 419, 2023: 427, 2024: 453, 2025: 465,
	},
}

// SupportedGameCodes lists all sport codes the sync loop iterates.
var SupportedGameCodes = []string{"nfl", "nba", "nhl", "mlb"}

// GameKey returns the Yahoo game ID for a sport + season from the static table.
// Returns an error if the game code or season is not in the mapping.
//
// Prefer ResolveGameKey(), which falls back to a live Yahoo lookup for seasons
// not in the static table. This function remains for callers that only need
// the fast in-memory check.
func GameKey(gameCode string, season int) (int, error) {
	seasons, ok := gameKeys[gameCode]
	if !ok {
		return 0, fmt.Errorf("invalid game code %q (must be mlb, nfl, nba, or nhl)", gameCode)
	}
	key, ok := seasons[season]
	if !ok {
		return 0, fmt.Errorf("no game key for %s season %d", gameCode, season)
	}
	return key, nil
}

// =============================================================================
// Dynamic game key resolution
//
// Yahoo mints a new game_key each season. Rather than hardcoding every future
// year, ResolveGameKey queries Yahoo's /games endpoint on demand whenever the
// static table misses, caching the result process-wide.
// =============================================================================

var (
	dynamicGameKeyCache = make(map[string]int)
	dynamicGameKeyMu    sync.RWMutex
)

// gamesDiscoveryResponse matches the XML returned by
// /games;game_codes={code};seasons={year}
type gamesDiscoveryResponse struct {
	XMLName xml.Name `xml:"fantasy_content"`
	Games   struct {
		Game []struct {
			GameKey string `xml:"game_key"`
			Code    string `xml:"code"`
			Season  string `xml:"season"`
		} `xml:"game"`
	} `xml:"games"`
}

// ResolveGameKey returns the Yahoo game_key for a sport + season.
// It checks the static table first, then the in-memory dynamic cache, then
// calls Yahoo to resolve. Successful lookups are cached until process restart.
func ResolveGameKey(ctx context.Context, client *YahooClient, gameCode string, season int) (int, error) {
	// 1) Static table (fast path, no network).
	if key, err := GameKey(gameCode, season); err == nil {
		return key, nil
	}

	// 2) Dynamic cache (successful Yahoo lookups).
	cacheKey := fmt.Sprintf("%s:%d", gameCode, season)
	dynamicGameKeyMu.RLock()
	if key, ok := dynamicGameKeyCache[cacheKey]; ok {
		dynamicGameKeyMu.RUnlock()
		return key, nil
	}
	dynamicGameKeyMu.RUnlock()

	// 3) Live Yahoo lookup.
	if client == nil {
		return 0, fmt.Errorf("no game key for %s season %d and no client for dynamic lookup", gameCode, season)
	}

	urlPath := fmt.Sprintf("games;game_codes=%s;seasons=%d", gameCode, season)

	var xmlBody []byte
	err := client.withRetry(ctx, fmt.Sprintf("resolveGameKey(%s,%d)", gameCode, season), func() error {
		var reqErr error
		xmlBody, reqErr = client.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return 0, fmt.Errorf("yahoo games discovery for %s/%d: %w", gameCode, season, err)
	}

	var resp gamesDiscoveryResponse
	if err := xml.Unmarshal(xmlBody, &resp); err != nil {
		return 0, fmt.Errorf("parse games discovery XML: %w", err)
	}

	for _, g := range resp.Games.Game {
		if g.Code != gameCode {
			continue
		}
		parsedSeason, _ := strconv.Atoi(g.Season)
		if parsedSeason != season {
			continue
		}
		key, err := strconv.Atoi(g.GameKey)
		if err != nil {
			return 0, fmt.Errorf("parse game_key %q: %w", g.GameKey, err)
		}

		dynamicGameKeyMu.Lock()
		dynamicGameKeyCache[cacheKey] = key
		dynamicGameKeyMu.Unlock()

		log.Printf("[GameKeys] Resolved %s/%d -> %d (dynamic)", gameCode, season, key)
		return key, nil
	}

	return 0, fmt.Errorf("yahoo returned no game for %s season %d", gameCode, season)
}
