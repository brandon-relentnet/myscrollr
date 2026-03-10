package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// =============================================================================
// Constants
// =============================================================================

const (
	// CacheKeySports is the Redis key for cached game data (all games, public).
	CacheKeySports = "cache:sports"

	// CacheKeySportsPrefix is the Redis key prefix for per-user game caches.
	CacheKeySportsPrefix = "cache:sports:"

	// CacheKeySportsCatalog is the Redis key for the cached league catalog.
	CacheKeySportsCatalog = "cache:sports:catalog"

	// SportsCacheTTL is how long game data is cached.
	SportsCacheTTL = 30 * time.Second

	// SportsCatalogCacheTTL is how long the league catalog is cached.
	// Reduced from 5min to 60s because game activity status changes frequently.
	SportsCatalogCacheTTL = 60 * time.Second

	// SportsLeagueSubscribersPrefix is the per-league subscriber set prefix.
	// Keys: sports:subscribers:league:{NFL}, sports:subscribers:league:{NBA}, etc.
	SportsLeagueSubscribersPrefix = "sports:subscribers:league:"

	// DefaultSportsLimit caps the number of games returned for the public route.
	DefaultSportsLimit = 50

	// DashboardSportsLimit caps the number of games returned for dashboard.
	DashboardSportsLimit = 20
)

// =============================================================================
// App
// =============================================================================

// App holds the shared dependencies for all handlers.
type App struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

// =============================================================================
// Public Routes (proxied by core gateway)
// =============================================================================

// getSports retrieves the latest sports games.
// If X-User-Sub is set (authenticated), returns per-user filtered games.
// Otherwise returns all games (public).
func (a *App) getSports(c *fiber.Ctx) error {
	userSub := c.Get("X-User-Sub")

	// Authenticated: return per-user filtered games
	if userSub != "" {
		return a.getUserGames(c, userSub, DefaultSportsLimit)
	}

	// Public: return all games
	var games []Game
	if GetCache(a.rdb, CacheKeySports, &games) {
		c.Set("X-Cache", "HIT")
		return c.JSON(games)
	}

	games, err := a.queryGames(context.Background(), DefaultSportsLimit)
	if err != nil {
		log.Printf("[Sports] getSports query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Internal server error",
		})
	}

	SetCache(a.rdb, CacheKeySports, games, SportsCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(games)
}

// getLeagueCatalog returns all enabled tracked leagues for the dashboard
// league browser, enriched with per-league game counts and activity status.
func (a *App) getLeagueCatalog(c *fiber.Ctx) error {
	var catalog []TrackedLeague
	if GetCache(a.rdb, CacheKeySportsCatalog, &catalog) {
		c.Set("X-Cache", "HIT")
		return c.JSON(catalog)
	}

	ctx := context.Background()

	rows, err := a.db.Query(ctx,
		`SELECT name, COALESCE(sport_api, ''), COALESCE(category, 'Other'), COALESCE(country, ''), COALESCE(logo_url, '')
		 FROM tracked_leagues WHERE is_enabled = true ORDER BY category, name`)
	if err != nil {
		log.Printf("[Sports] Catalog query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch league catalog",
		})
	}
	defer rows.Close()

	catalog = make([]TrackedLeague, 0)
	for rows.Next() {
		var l TrackedLeague
		if err := rows.Scan(&l.Name, &l.SportAPI, &l.Category, &l.Country, &l.LogoURL); err != nil {
			log.Printf("[Sports] Catalog scan error: %v", err)
			continue
		}
		catalog = append(catalog, l)
	}

	// Enrich with per-league game activity counts.
	type leagueStatus struct {
		GameCount int
		LiveCount int
		NextGame  *time.Time
	}
	statusMap := make(map[string]leagueStatus)

	statusRows, err := a.db.Query(ctx,
		`SELECT league,
		        COUNT(*) AS game_count,
		        COUNT(*) FILTER (WHERE state = 'in') AS live_count,
		        MIN(start_time) FILTER (WHERE state = 'pre') AS next_game
		 FROM games
		 GROUP BY league`)
	if err != nil {
		log.Printf("[Sports] League status query failed (non-fatal): %v", err)
		// Continue without enrichment — the catalog is still useful.
	} else {
		defer statusRows.Close()
		for statusRows.Next() {
			var league string
			var s leagueStatus
			if err := statusRows.Scan(&league, &s.GameCount, &s.LiveCount, &s.NextGame); err != nil {
				log.Printf("[Sports] League status scan error: %v", err)
				continue
			}
			statusMap[league] = s
		}
	}

	for i := range catalog {
		if s, ok := statusMap[catalog[i].Name]; ok {
			catalog[i].GameCount = s.GameCount
			catalog[i].LiveCount = s.LiveCount
			catalog[i].NextGame = s.NextGame
		}
	}

	SetCache(a.rdb, CacheKeySportsCatalog, catalog, SportsCatalogCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(catalog)
}

// healthHandler proxies a health check to the internal Rust sports service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_SPORTS_URL"))
}

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records.
//
// Per-league routing: each CDC record contains a "league" field (e.g. "NFL",
// "NBA"). The handler looks up per-league subscriber sets to determine which
// users follow that league.
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

	for _, rec := range req.Records {
		league, ok := rec.Record["league"].(string)
		if !ok || league == "" {
			continue
		}

		subs, err := GetSubscribers(a.rdb, ctx, SportsLeagueSubscribersPrefix+league)
		if err != nil {
			log.Printf("[Sports CDC] Failed to get league subscribers for %s: %v", league, err)
			continue
		}

		for _, sub := range subs {
			userSet[sub] = struct{}{}
		}
	}

	users := make([]string, 0, len(userSet))
	for sub := range userSet {
		users = append(users, sub)
	}

	return c.JSON(fiber.Map{"users": users})
}

// handleInternalDashboard returns sports data for a user's dashboard.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	userSub := c.Query("user")
	if userSub == "" {
		return c.JSON(fiber.Map{"sports": []Game{}})
	}

	// Check per-user cache first
	cacheKey := CacheKeySportsPrefix + userSub
	var games []Game
	if GetCache(a.rdb, cacheKey, &games) {
		return c.JSON(fiber.Map{"sports": games})
	}

	// Get user's selected leagues from their channel config
	leagues := a.getUserSportsLeagues(userSub)
	if len(leagues) == 0 {
		return c.JSON(fiber.Map{"sports": []Game{}})
	}

	games, err := a.queryGamesByLeagues(context.Background(), leagues, DashboardSportsLimit)
	if err != nil {
		log.Printf("[Sports] Dashboard query failed: %v", err)
		return c.JSON(fiber.Map{"sports": []Game{}})
	}

	SetCache(a.rdb, cacheKey, games, SportsCacheTTL)
	return c.JSON(fiber.Map{"sports": games})
}

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}

// =============================================================================
// Channel Lifecycle
// =============================================================================

// handleChannelLifecycle handles channel lifecycle events dispatched by the core
// gateway. Events: created, updated, deleted, sync.
func (a *App) handleChannelLifecycle(c *fiber.Ctx) error {
	var req struct {
		Event     string                 `json:"event"`
		User      string                 `json:"user"`
		Config    map[string]interface{} `json:"config"`
		OldConfig map[string]interface{} `json:"old_config"`
		Enabled   bool                   `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	ctx := context.Background()

	switch req.Event {
	case "created":
		log.Printf("[Sports Lifecycle] Channel created for user %s", req.User)

	case "updated":
		a.onChannelUpdated(ctx, req.User, req.OldConfig, req.Config)

	case "deleted":
		a.onChannelDeleted(ctx, req.User, req.Config)

	case "sync":
		a.onSyncSubscriptions(ctx, req.User, req.Config, req.Enabled)

	default:
		log.Printf("[Sports Lifecycle] Unknown event: %s", req.Event)
	}

	return c.JSON(fiber.Map{"ok": true})
}

// onChannelUpdated handles league list changes when a channel is updated.
func (a *App) onChannelUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) {
	if newConfig == nil {
		return
	}

	oldLeagues := extractLeaguesFromChannelConfig(oldConfig)
	newLeagues := extractLeaguesFromChannelConfig(newConfig)
	newSet := make(map[string]bool, len(newLeagues))
	for _, l := range newLeagues {
		newSet[l] = true
	}
	for _, l := range oldLeagues {
		if !newSet[l] {
			RemoveSubscriber(a.rdb, ctx, SportsLeagueSubscribersPrefix+l, userSub)
		}
	}

	// Invalidate per-user cache
	DeleteCache(a.rdb, CacheKeySportsPrefix+userSub)
}

// onChannelDeleted removes the user from all league subscriber sets.
func (a *App) onChannelDeleted(ctx context.Context, userSub string, config map[string]interface{}) {
	leagues := extractLeaguesFromChannelConfig(config)
	for _, l := range leagues {
		RemoveSubscriber(a.rdb, ctx, SportsLeagueSubscribersPrefix+l, userSub)
	}
	DeleteCache(a.rdb, CacheKeySportsPrefix+userSub)
}

// onSyncSubscriptions adds or removes the user from per-league subscriber
// sets based on the enabled flag.
func (a *App) onSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) {
	leagues := extractLeaguesFromChannelConfig(config)
	for _, l := range leagues {
		if enabled {
			AddSubscriber(a.rdb, ctx, SportsLeagueSubscribersPrefix+l, userSub)
		} else {
			RemoveSubscriber(a.rdb, ctx, SportsLeagueSubscribersPrefix+l, userSub)
		}
	}
}

// =============================================================================
// Database Helpers
// =============================================================================

// queryGames fetches games from PostgreSQL ordered by start_time descending.
func (a *App) queryGames(ctx context.Context, limit int) ([]Game, error) {
	rows, err := a.db.Query(ctx, fmt.Sprintf(`
		SELECT id, league, COALESCE(sport, ''), external_game_id, COALESCE(link, ''),
			home_team_name, COALESCE(home_team_logo, ''), COALESCE(home_team_score::text, ''),
			away_team_name, COALESCE(away_team_logo, ''), COALESCE(away_team_score::text, ''),
			start_time, COALESCE(short_detail, ''), state,
			COALESCE(status_short, ''), COALESCE(status_long, ''),
			COALESCE(timer, ''), COALESCE(venue, ''), COALESCE(season, '')
		FROM games ORDER BY start_time DESC LIMIT %d`, limit))
	if err != nil {
		return nil, fmt.Errorf("sports query failed: %w", err)
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		var g Game
		if err := rows.Scan(
			&g.ID, &g.League, &g.Sport, &g.ExternalGameID, &g.Link,
			&g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore,
			&g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore,
			&g.StartTime, &g.ShortDetail, &g.State,
			&g.StatusShort, &g.StatusLong, &g.Timer, &g.Venue, &g.Season,
		); err != nil {
			log.Printf("[Sports] Row scan failed: %v", err)
			continue
		}
		games = append(games, g)
	}

	return games, nil
}

// queryGamesByLeagues fetches games for specific leagues.
func (a *App) queryGamesByLeagues(ctx context.Context, leagues []string, limit int) ([]Game, error) {
	if len(leagues) == 0 {
		return make([]Game, 0), nil
	}

	rows, err := a.db.Query(ctx, fmt.Sprintf(`
		SELECT id, league, COALESCE(sport, ''), external_game_id, COALESCE(link, ''),
			home_team_name, COALESCE(home_team_logo, ''), COALESCE(home_team_score::text, ''),
			away_team_name, COALESCE(away_team_logo, ''), COALESCE(away_team_score::text, ''),
			start_time, COALESCE(short_detail, ''), state,
			COALESCE(status_short, ''), COALESCE(status_long, ''),
			COALESCE(timer, ''), COALESCE(venue, ''), COALESCE(season, '')
		FROM games
		WHERE league = ANY($1)
		ORDER BY start_time DESC LIMIT %d`, limit), leagues)
	if err != nil {
		return nil, fmt.Errorf("sports league query failed: %w", err)
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		var g Game
		if err := rows.Scan(
			&g.ID, &g.League, &g.Sport, &g.ExternalGameID, &g.Link,
			&g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore,
			&g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore,
			&g.StartTime, &g.ShortDetail, &g.State,
			&g.StatusShort, &g.StatusLong, &g.Timer, &g.Venue, &g.Season,
		); err != nil {
			log.Printf("[Sports] Row scan failed: %v", err)
			continue
		}
		games = append(games, g)
	}

	return games, nil
}

// getUserGames returns per-user filtered games (used by authenticated getSports).
func (a *App) getUserGames(c *fiber.Ctx, userSub string, limit int) error {
	cacheKey := CacheKeySportsPrefix + userSub
	var games []Game
	if GetCache(a.rdb, cacheKey, &games) {
		c.Set("X-Cache", "HIT")
		return c.JSON(games)
	}

	leagues := a.getUserSportsLeagues(userSub)
	if len(leagues) == 0 {
		return c.JSON([]Game{})
	}

	games, err := a.queryGamesByLeagues(context.Background(), leagues, limit)
	if err != nil {
		log.Printf("[Sports] getUserGames query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Internal server error",
		})
	}

	SetCache(a.rdb, cacheKey, games, SportsCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(games)
}

// getUserSportsLeagues extracts the league list from a user's sports channel config.
func (a *App) getUserSportsLeagues(logtoSub string) []string {
	var configJSON []byte
	err := a.db.QueryRow(context.Background(), `
		SELECT config FROM user_channels
		WHERE logto_sub = $1 AND channel_type = 'sports'
	`, logtoSub).Scan(&configJSON)
	if err != nil {
		return nil
	}
	return extractLeaguesFromConfig(configJSON)
}

// =============================================================================
// Config Parsing Helpers
// =============================================================================

// extractLeaguesFromChannelConfig extracts leagues from a channel's config map.
func extractLeaguesFromChannelConfig(config map[string]interface{}) []string {
	if config == nil {
		return nil
	}
	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil
	}
	return extractLeaguesFromConfig(configJSON)
}

// extractLeaguesFromConfig parses a config JSONB blob and returns league name strings.
func extractLeaguesFromConfig(configJSON []byte) []string {
	var config struct {
		Leagues []string `json:"leagues"`
	}
	if err := json.Unmarshal(configJSON, &config); err != nil {
		return nil
	}

	leagues := make([]string, 0, len(config.Leagues))
	for _, l := range config.Leagues {
		if l != "" {
			leagues = append(leagues, l)
		}
	}
	return leagues
}
