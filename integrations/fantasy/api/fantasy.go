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
	CacheKeyYahooLeaguesPrefix   = "cache:yahoo:leagues:"
	CacheKeyYahooStandingsPrefix = "cache:yahoo:standings:"
	CacheKeyYahooMatchupsPrefix  = "cache:yahoo:matchups:"
	CacheKeyYahooRosterPrefix    = "cache:yahoo:roster:"
	YahooCacheTTL                = 5 * time.Minute
	YahooAPITimeout              = 10 * time.Second
	YahooAuthCookieExpiry        = 24 * time.Hour
	YahooRefreshCookieExpiry     = 30 * 24 * time.Hour
	RedisCSRFPrefix              = "csrf:"
	RedisYahooStateLogtoPrefix   = "yahoo_state_logto:"
	RedisTokenToGuidPrefix       = "token_to_guid:"
	TokenToGuidTTL               = 24 * time.Hour
	RedisScanCount               = 100
	OAuthStateExpiry             = 10 * time.Minute
	OAuthStateBytes              = 16
	DefaultFrontendURL           = "https://myscrollr.com"
	AuthPopupCloseDelayMs        = 1500
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

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records.
//
// Fantasy CDC routing is complex — each table type uses a different resolution
// strategy to map records to user logto_sub values via DB JOINs.
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
			a.resolveByGuid(ctx, record.Record, userSet)
		case "yahoo_standings":
			a.resolveByLeagueKey(ctx, record.Record, userSet)
		case "yahoo_matchups":
			a.resolveByTeamKey(ctx, record.Record, userSet)
		case "yahoo_rosters":
			a.resolveByTeamKey(ctx, record.Record, userSet)
		}
	}

	users := make([]string, 0, len(userSet))
	for sub := range userSet {
		users = append(users, sub)
	}

	return c.JSON(fiber.Map{"users": users})
}

// handleInternalDashboard returns fantasy data for a user's dashboard.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	userSub := c.Query("user")
	if userSub == "" {
		return c.JSON(fiber.Map{"fantasy": nil})
	}

	// Resolve logto_sub -> guid
	var guid string
	err := a.db.QueryRow(context.Background(), "SELECT guid FROM yahoo_users WHERE logto_sub = $1", userSub).Scan(&guid)
	if err != nil {
		// User hasn't connected Yahoo — return nil (no data)
		return c.JSON(fiber.Map{"fantasy": nil})
	}

	cacheKey := CacheKeyYahooLeaguesPrefix + guid

	var content FantasyContent
	if GetCache(a.rdb, cacheKey, &content) {
		return c.JSON(fiber.Map{"fantasy": content})
	}

	// Try Database (Active Sync data)
	var data []byte
	err = a.db.QueryRow(context.Background(), "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
	if err == nil {
		if err := json.Unmarshal(data, &content); err == nil {
			SetCache(a.rdb, cacheKey, content, YahooCacheTTL)
			return c.JSON(fiber.Map{"fantasy": content})
		}
	}

	// No cached or DB data
	return c.JSON(fiber.Map{"fantasy": nil})
}

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}

// healthHandler proxies a health check to the internal Rust yahoo service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_YAHOO_URL"))
}

// =============================================================================
// CDC Routing Resolvers
// =============================================================================

// resolveByGuid resolves a yahoo_leagues record's guid to a logto_sub.
func (a *App) resolveByGuid(ctx context.Context, record map[string]interface{}, userSet map[string]struct{}) {
	guid, ok := record["guid"].(string)
	if !ok || guid == "" {
		return
	}
	var logtoSub string
	err := a.db.QueryRow(ctx, "SELECT logto_sub FROM yahoo_users WHERE guid = $1", guid).Scan(&logtoSub)
	if err != nil {
		return // User not found or DB error — skip silently
	}
	userSet[logtoSub] = struct{}{}
}

// resolveByLeagueKey resolves a yahoo_standings record's league_key to a logto_sub
// via a JOIN through yahoo_leagues -> yahoo_users.
func (a *App) resolveByLeagueKey(ctx context.Context, record map[string]interface{}, userSet map[string]struct{}) {
	leagueKey, ok := record["league_key"].(string)
	if !ok || leagueKey == "" {
		return
	}
	var logtoSub string
	err := a.db.QueryRow(ctx, `
		SELECT yu.logto_sub FROM yahoo_leagues yl
		JOIN yahoo_users yu ON yl.guid = yu.guid
		WHERE yl.league_key = $1
	`, leagueKey).Scan(&logtoSub)
	if err != nil {
		return
	}
	userSet[logtoSub] = struct{}{}
}

// resolveByTeamKey resolves a yahoo_matchups/yahoo_rosters record's team_key
// to a logto_sub. Team keys follow the format "nfl.l.{league_id}.t.{team_id}"
// — we extract the league portion and JOIN through yahoo_leagues -> yahoo_users.
func (a *App) resolveByTeamKey(ctx context.Context, record map[string]interface{}, userSet map[string]struct{}) {
	teamKey, ok := record["team_key"].(string)
	if !ok || teamKey == "" {
		return
	}

	// Extract league_key from team_key: "nfl.l.12345.t.1" → "nfl.l.12345"
	parts := strings.SplitN(teamKey, ".t.", 2)
	if len(parts) == 0 {
		return
	}
	leagueKey := parts[0]

	var logtoSub string
	err := a.db.QueryRow(ctx, `
		SELECT yu.logto_sub FROM yahoo_leagues yl
		JOIN yahoo_users yu ON yl.guid = yu.guid
		WHERE yl.league_key = $1
	`, leagueKey).Scan(&logtoSub)
	if err != nil {
		return
	}
	userSet[logtoSub] = struct{}{}
}

// =============================================================================
// Database Helpers
// =============================================================================

// UpsertYahooUser inserts or updates a Yahoo user with an encrypted refresh token.
func (a *App) UpsertYahooUser(guid, logtoSub, refreshToken string) error {
	encryptedToken, err := Encrypt(refreshToken)
	if err != nil {
		log.Printf("[Security Error] Failed to encrypt refresh token for user %s: %v", guid, err)
		return err
	}

	_, err = a.db.Exec(context.Background(), `
		INSERT INTO yahoo_users (guid, logto_sub, refresh_token)
		VALUES ($1, $2, $3)
		ON CONFLICT (guid) DO UPDATE
		SET logto_sub = EXCLUDED.logto_sub, refresh_token = EXCLUDED.refresh_token;
	`, guid, logtoSub, encryptedToken)

	return err
}
