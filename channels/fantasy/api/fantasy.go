package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

// =============================================================================
// Constants
// =============================================================================

const (
	// Redis key prefixes for CDC subscriber resolution
	RedisLeagueUsersPrefix = "fantasy:league_users:" // SET of logto_subs per league_key
	RedisGuidUserPrefix    = "fantasy:guid_user:"    // SET of logto_subs per Yahoo GUID

	// OAuth state management
	RedisCSRFPrefix            = "csrf:"
	RedisYahooStateLogtoPrefix = "yahoo_state_logto:"

	// Timeouts and expiries
	YahooAPITimeout      = 10 * time.Second
	OAuthStateExpiry     = 10 * time.Minute
	OAuthStateBytes      = 16
	DefaultFrontendURL   = "https://myscrollr.com"
	AuthPopupCloseDelayMs = 1500
)

// =============================================================================
// App
// =============================================================================

// App holds the shared dependencies for all handlers.
type App struct {
	db          *pgxpool.Pool
	rdb         *redis.Client
	yahooConfig *oauth2.Config
}

// resolveFrontendURL returns the URL to use for postMessage targetOrigin.
// Priority: FRONTEND_URL env > first origin in ALLOWED_ORIGINS > DefaultFrontendURL.
func resolveFrontendURL() string {
	if v := strings.TrimSpace(os.Getenv("FRONTEND_URL")); v != "" {
		return ValidateURL(v, DefaultFrontendURL)
	}

	// ALLOWED_ORIGINS is a comma-separated list of origins the core gateway
	// accepts (e.g. "https://myscrollr.relentnet.dev,https://myscrollr.com").
	// The first entry is typically the primary frontend.
	if origins := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS")); origins != "" {
		first := strings.SplitN(origins, ",", 2)[0]
		first = strings.TrimSpace(first)
		if first != "" {
			log.Printf("[FrontendURL] FRONTEND_URL not set, deriving from ALLOWED_ORIGINS: %s", first)
			return ValidateURL(first, DefaultFrontendURL)
		}
	}

	log.Printf("[Security Warning] FRONTEND_URL and ALLOWED_ORIGINS not set, using default %s", DefaultFrontendURL)
	return DefaultFrontendURL
}

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records.
//
// Fantasy uses per-league Redis SET routing for standings/matchups/rosters,
// and per-GUID Redis SET routing for yahoo_leagues changes.
// Zero SQL JOINs in the hot path — all lookups are Redis SMEMBERS.
func (a *App) handleInternalCDC(c *fiber.Ctx) error {
	var req struct {
		Records []CDCRecord `json:"records"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	ctx := context.Background()
	userSet := make(map[string]struct{})

	for _, record := range req.Records {
		switch record.Metadata.TableName {
		case "yahoo_leagues":
			// yahoo_leagues has a guid column — look up via fantasy:guid_user:{guid}
			guid, ok := record.Record["guid"].(string)
			if !ok || guid == "" {
				continue
			}
			subs, err := GetSubscribers(a.rdb, ctx, RedisGuidUserPrefix+guid)
			if err != nil {
				log.Printf("[Fantasy CDC] Failed to get subscribers for guid=%s: %v", guid, err)
				continue
			}
			for _, sub := range subs {
				userSet[sub] = struct{}{}
			}

		case "yahoo_standings", "yahoo_matchups":
			// Both have league_key — look up via fantasy:league_users:{league_key}
			leagueKey, ok := record.Record["league_key"].(string)
			if !ok || leagueKey == "" {
				continue
			}
			subs, err := GetSubscribers(a.rdb, ctx, RedisLeagueUsersPrefix+leagueKey)
			if err != nil {
				log.Printf("[Fantasy CDC] Failed to get subscribers for league=%s: %v", leagueKey, err)
				continue
			}
			for _, sub := range subs {
				userSet[sub] = struct{}{}
			}

		case "yahoo_rosters":
			// yahoo_rosters has league_key — same as standings/matchups
			leagueKey, ok := record.Record["league_key"].(string)
			if !ok || leagueKey == "" {
				continue
			}
			subs, err := GetSubscribers(a.rdb, ctx, RedisLeagueUsersPrefix+leagueKey)
			if err != nil {
				log.Printf("[Fantasy CDC] Failed to get subscribers for league=%s: %v", leagueKey, err)
				continue
			}
			for _, sub := range subs {
				userSet[sub] = struct{}{}
			}
		}
	}

	users := make([]string, 0, len(userSet))
	for sub := range userSet {
		users = append(users, sub)
	}

	return c.JSON(fiber.Map{"users": users})
}

// handleInternalDashboard returns fantasy data for a user's dashboard.
// Returns all leagues the user has imported, with standings, current matchups,
// and rosters for all teams in each league.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	userSub := c.Query("user")
	if userSub == "" {
		return c.JSON(fiber.Map{"fantasy": nil})
	}

	// Resolve logto_sub → guid
	var guid string
	err := a.db.QueryRow(context.Background(),
		"SELECT guid FROM yahoo_users WHERE logto_sub = $1", userSub).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"fantasy": nil})
	}

	// Fetch all leagues for this user via the user_leagues junction table
	leagueRows, err := a.db.Query(context.Background(), `
		SELECT l.league_key, l.name, l.game_code, l.season, l.data,
		       ul.team_key, ul.team_name
		FROM yahoo_leagues l
		JOIN yahoo_user_leagues ul ON l.league_key = ul.league_key
		WHERE ul.guid = $1
		ORDER BY l.game_code, l.season DESC
	`, guid)
	if err != nil {
		log.Printf("[Dashboard] League query error for guid=%s: %v", guid, err)
		return c.JSON(fiber.Map{"fantasy": nil})
	}
	defer leagueRows.Close()

	leagues := make([]LeagueResponse, 0)
	leagueKeys := make([]string, 0)
	for leagueRows.Next() {
		var lr LeagueResponse
		if err := leagueRows.Scan(
			&lr.LeagueKey, &lr.Name, &lr.GameCode, &lr.Season, &lr.Data,
			&lr.TeamKey, &lr.TeamName,
		); err != nil {
			log.Printf("[Dashboard] Scan error: %v", err)
			continue
		}
		leagues = append(leagues, lr)
		leagueKeys = append(leagueKeys, lr.LeagueKey)
	}

	if len(leagues) == 0 {
		return c.JSON(fiber.Map{"fantasy": MyLeaguesResponse{Leagues: leagues}})
	}

	// Batch-fetch standings for all leagues
	standingsMap := make(map[string]json.RawMessage)
	standingsRows, err := a.db.Query(context.Background(),
		"SELECT league_key, data FROM yahoo_standings WHERE league_key = ANY($1)", leagueKeys)
	if err == nil {
		defer standingsRows.Close()
		for standingsRows.Next() {
			var lk string
			var data json.RawMessage
			if err := standingsRows.Scan(&lk, &data); err == nil {
				standingsMap[lk] = data
			}
		}
	}

	// Batch-fetch current matchups for all leagues (most recent week per league)
	matchupsMap := make(map[string]json.RawMessage)
	matchupsRows, err := a.db.Query(context.Background(), `
		SELECT DISTINCT ON (league_key) league_key, data
		FROM yahoo_matchups
		WHERE league_key = ANY($1)
		ORDER BY league_key, week DESC
	`, leagueKeys)
	if err == nil {
		defer matchupsRows.Close()
		for matchupsRows.Next() {
			var lk string
			var data json.RawMessage
			if err := matchupsRows.Scan(&lk, &data); err == nil {
				matchupsMap[lk] = data
			}
		}
	}

	// Batch-fetch all rosters grouped by league
	rostersMap := make(map[string]json.RawMessage)
	rostersRows, err := a.db.Query(context.Background(), `
		SELECT league_key,
		       json_agg(json_build_object('team_key', team_key, 'data', data)) AS rosters
		FROM yahoo_rosters
		WHERE league_key = ANY($1)
		GROUP BY league_key
	`, leagueKeys)
	if err == nil {
		defer rostersRows.Close()
		for rostersRows.Next() {
			var lk string
			var data json.RawMessage
			if err := rostersRows.Scan(&lk, &data); err == nil {
				rostersMap[lk] = data
			}
		}
	}

	// Attach associated data to each league
	for i := range leagues {
		lk := leagues[i].LeagueKey
		if s, ok := standingsMap[lk]; ok {
			leagues[i].Standings = s
		}
		if m, ok := matchupsMap[lk]; ok {
			leagues[i].Matchups = m
		}
		if r, ok := rostersMap[lk]; ok {
			leagues[i].Rosters = r
		}
	}

	return c.JSON(fiber.Map{"fantasy": MyLeaguesResponse{Leagues: leagues}})
}

// healthHandler proxies a health check to the internal Python yahoo service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_YAHOO_URL"))
}
