package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/swagger"
	"github.com/joho/godotenv"

	// Import generated docs
	_ "github.com/brandon-relentnet/myscrollr/api/docs"
)

// HealthResponse represents the aggregated health status
type HealthResponse struct {
	Status   string            `json:"status"`
	Database string            `json:"database"`
	Redis    string            `json:"redis"`
	Services map[string]string `json:"services"`
}

// ErrorResponse represents a standard API error
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// @title Scrollr API
// @version 1.0
// @description High-performance data API for Scrollr finance and sports.
// @host api.myscrollr.relentnet.dev
// @BasePath /
// @securityDefinitions.apikey LogtoAuth
// @in header
// @name Authorization
// @description Type 'Bearer ' followed by your Logto JWT.
func validateURL(urlStr, fallback string) string {
	if urlStr == "" {
		return fallback
	}
	urlStr = strings.TrimSpace(urlStr)
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		urlStr = "https://" + urlStr
	}
	return strings.TrimSuffix(urlStr, "/")
}

func main() {
	_ = godotenv.Load()

	ConnectDB()
	defer dbPool.Close()

	ConnectRedis()
	defer rdb.Close()
	
	InitHub()

	InitYahoo()
	InitAuth()

	app := fiber.New(fiber.Config{
		AppName: "Scrollr API",
	})

	app.Use(logger.New())

	// Security Headers
	app.Use(func(c *fiber.Ctx) error {
		c.Set("X-XSS-Protection", "1; mode=block")
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Download-Options", "noopen")
		c.Set("Strict-Transport-Security", fmt.Sprintf("max-age=%d; includeSubDomains", HSTSMaxAge))
		c.Set("X-Frame-Options", "SAMEORIGIN")
		c.Set("X-DNS-Prefetch-Control", "off")
		// Swagger UI needs its own scripts, styles, and fonts — use a permissive CSP for it
		if strings.HasPrefix(c.Path(), "/swagger") {
			c.Set("Content-Security-Policy", "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com")
		} else {
			c.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}
		return c.Next()
	})

	// Hardened CORS
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = DefaultAllowedOrigins
	} else {
		// Clean and validate provided origins
		origins := strings.Split(allowedOrigins, ",")
		for i, o := range origins {
			origins[i] = validateURL(o, "")
		}
		allowedOrigins = strings.Join(origins, ",")
	}

	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowCredentials: true,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
	}))

	// Rate Limiting (skip health checks, SSE, and webhooks)
	app.Use(limiter.New(limiter.Config{
		Max:        RateLimitMax,
		Expiration: RateLimitExpiration,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		Next: func(c *fiber.Ctx) bool {
			path := c.Path()
			return path == "/health" ||
				path == "/events" ||
				path == "/sports/health" ||
				path == "/finance/health" ||
				path == "/yahoo/health" ||
				path == "/rss/health" ||
				path == "/rss/feeds" ||
				path == "/webhooks/sequin"
		},
	}))

	app.Get("/swagger/*", swagger.HandlerDefault)

	// --- Public Routes ---
	app.Get("/health", HealthCheck)
	app.Get("/events", StreamEvents)
	app.Get("/events/count", GetActiveViewers)
	app.Get("/sports/health", SportsHealth)
	app.Get("/finance/health", FinanceHealth)
	app.Get("/yahoo/health", YahooHealth)
	app.Get("/yahoo/start", YahooStart)
	app.Get("/yahoo/callback", YahooCallback)
	app.Get("/rss/health", RssHealth)
	app.Get("/rss/feeds", GetRSSFeedCatalog)
	app.Post("/webhooks/sequin", HandleSequinWebhook)
	// Extension auth proxy (PKCE token exchange/refresh via Logto)
	app.Options("/extension/token", HandleExtensionAuthPreflight)
	app.Post("/extension/token", HandleExtensionTokenExchange)
	app.Options("/extension/token/refresh", HandleExtensionAuthPreflight)
	app.Post("/extension/token/refresh", HandleExtensionTokenRefresh)
	app.Get("/", LandingPage)

	// --- Protected Routes (Logto) ---
	// We apply LogtoAuth individually to routes to ensure 404s for unknown routes
	// instead of a 401 triggered by the group-level middleware prefix match.
	api := app.Group("/")

	// Data Routes
	api.Get("/sports", LogtoAuth, GetSports)
	api.Get("/finance", LogtoAuth, GetFinance)
	api.Get("/dashboard", LogtoAuth, GetDashboard)

	// Yahoo OAuth & Data
	api.Get("/yahoo/leagues", LogtoAuth, YahooLeagues)
	api.Get("/yahoo/league/:league_key/standings", LogtoAuth, YahooStandings)
	api.Get("/yahoo/team/:team_key/matchups", LogtoAuth, YahooMatchups)
	api.Get("/yahoo/team/:team_key/roster", LogtoAuth, YahooRoster)

	// RSS Management
	api.Delete("/rss/feeds", LogtoAuth, DeleteCustomFeed)

	// User Routes (username from Logto, not our DB)
	api.Get("/users/:username", GetProfileByUsername)
	api.Get("/users/me/preferences", LogtoAuth, HandleGetPreferences)
	api.Put("/users/me/preferences", LogtoAuth, HandleUpdatePreferences)
	api.Get("/users/me/streams", LogtoAuth, GetStreams)
	api.Post("/users/me/streams", LogtoAuth, CreateStream)
	api.Put("/users/me/streams/:type", LogtoAuth, UpdateStream)
	api.Delete("/users/me/streams/:type", LogtoAuth, DeleteStream)
	api.Get("/users/me/yahoo-status", LogtoAuth, GetYahooStatus)
	api.Get("/users/me/yahoo-leagues", LogtoAuth, GetMyYahooLeagues)
	api.Delete("/users/me/yahoo", LogtoAuth, DisconnectYahoo)

	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}

func LandingPage(c *fiber.Ctx) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = DefaultFrontendURL
	}

	return c.JSON(fiber.Map{
		"name":    "Scrollr API",
		"version": "1.0",
		"status":  "operational",
		"links": fiber.Map{
			"health":   "/health",
			"docs":     "/swagger/index.html",
			"frontend": frontendURL,
			"status":   frontendURL + "/status",
		},
	})
}

// Health Handlers (proxyInternalHealth, HealthCheck, etc)

func buildHealthURL(baseURL string) string {
	url := strings.TrimSuffix(baseURL, "/")
	if !strings.HasSuffix(url, "/health") {
		url = url + "/health"
	}
	return url
}

func proxyInternalHealth(c *fiber.Ctx, internalURL string) error {
	if internalURL == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{Status: "unknown", Error: "Internal URL not configured"})
	}

	targetURL := buildHealthURL(internalURL)
	httpClient := &http.Client{Timeout: HealthProxyTimeout}
	resp, err := httpClient.Get(targetURL)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{Status: "down", Error: err.Error()})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}

func SportsHealth(c *fiber.Ctx) error { return proxyInternalHealth(c, os.Getenv("INTERNAL_SPORTS_URL")) }
func FinanceHealth(c *fiber.Ctx) error { return proxyInternalHealth(c, os.Getenv("INTERNAL_FINANCE_URL")) }
func YahooHealth(c *fiber.Ctx) error   { return proxyInternalHealth(c, os.Getenv("INTERNAL_YAHOO_URL")) }

func HealthCheck(c *fiber.Ctx) error {
	res := HealthResponse{Status: "healthy", Services: make(map[string]string)}
	if err := dbPool.Ping(context.Background()); err != nil {
		res.Database = "unhealthy"
		res.Status = "degraded"
	} else { res.Database = "healthy" }
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		res.Redis = "unhealthy"
		res.Status = "degraded"
	} else { res.Redis = "healthy" }

	services := map[string]string{
		"finance": os.Getenv("INTERNAL_FINANCE_URL"),
		"sports":  os.Getenv("INTERNAL_SPORTS_URL"),
		"yahoo":   os.Getenv("INTERNAL_YAHOO_URL"),
		"rss":     os.Getenv("INTERNAL_RSS_URL"),
	}

	httpClient := &http.Client{Timeout: HealthCheckTimeout}
	for name, baseURL := range services {
		if baseURL == "" { continue }
		targetURL := buildHealthURL(baseURL)
		resp, err := httpClient.Get(targetURL)
		if err != nil || resp.StatusCode != http.StatusOK {
			res.Services[name] = "down"
			res.Status = "degraded"
		} else { res.Services[name] = "healthy" }
	}
	return c.JSON(res)
}

// --- Data Handlers with Caching ---

// GetSports retrieves the latest sports games
// @Summary Get latest sports games
// @Description Fetches latest 50 games with 30s caching
// @Tags Data
// @Produce json
// @Success 200 {array} Game
// @Security LogtoAuth
// @Router /sports [get]
func GetSports(c *fiber.Ctx) error {
	var games []Game
	if GetCache(CacheKeySports, &games) {
		c.Set("X-Cache", "HIT")
		return c.JSON(games)
	}

	rows, err := dbPool.Query(context.Background(),
		fmt.Sprintf("SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT %d", DefaultSportsLimit))
	if err != nil {
		log.Printf("[Database Error] GetSports query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Internal server error"})
	}
	defer rows.Close()

	for rows.Next() {
		var g Game
		if err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State); err != nil {
			log.Printf("[Database Error] GetSports scan failed: %v", err)
			continue
		}
		games = append(games, g)
	}

	SetCache(CacheKeySports, games, SportsCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(games)
}

// GetFinance retrieves the latest financial trades
// @Summary Get latest finance trades
// @Description Fetches latest stock/crypto trades with 30s caching
// @Tags Data
// @Produce json
// @Success 200 {array} Trade
// @Security LogtoAuth
// @Router /finance [get]
func GetFinance(c *fiber.Ctx) error {
	var trades []Trade
	if GetCache(CacheKeyFinance, &trades) {
		c.Set("X-Cache", "HIT")
		return c.JSON(trades)
	}

	rows, err := dbPool.Query(context.Background(),
		"SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
	if err != nil {
		log.Printf("[Database Error] GetFinance query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Internal server error"})
	}
	defer rows.Close()

	for rows.Next() {
		var t Trade
		if err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated); err != nil {
			log.Printf("[Database Error] GetFinance scan failed: %v", err)
			continue
		}
		trades = append(trades, t)
	}

	SetCache(CacheKeyFinance, trades, FinanceCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(trades)
}

// GetDashboard retrieves aggregated data for the user dashboard
// @Summary Get aggregated dashboard data
// @Description Combines Finance, Sports, and user Yahoo data in one call
// @Tags Data
// @Produce json
// @Success 200 {object} DashboardResponse
// @Security LogtoAuth
// @Router /dashboard [get]
func GetDashboard(c *fiber.Ctx) error {
	res := DashboardResponse{
		Finance: make([]Trade, 0),
		Sports:  make([]Game, 0),
		Rss:     make([]RssItem, 0),
	}

	// 1. User identity, preferences, streams, and enabled stream types
	userID := getUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}
	enabledTypes := map[string]bool{}

	prefs, err := getOrCreatePreferences(userID)
	if err == nil {
		res.Preferences = prefs
	}

	streams, err := getUserStreams(userID)
	if err == nil {
		res.Streams = streams
		for _, s := range streams {
			if s.Enabled {
				enabledTypes[s.StreamType] = true
			}
		}
	}

	// Warm Redis subscription sets from current DB state
	go syncStreamSubscriptions(userID)

	// 2. Finance (only if user has an enabled finance stream)
	if enabledTypes["finance"] {
		if !GetCache(CacheKeyFinance, &res.Finance) {
			rows, err := dbPool.Query(context.Background(), "SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
			if err != nil {
				log.Printf("[Database Error] Dashboard finance query failed: %v", err)
			} else {
				defer rows.Close()
				for rows.Next() {
					var t Trade
					if err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated); err != nil {
						log.Printf("[Database Error] Dashboard finance scan failed: %v", err)
						continue
					}
					res.Finance = append(res.Finance, t)
				}
				SetCache(CacheKeyFinance, res.Finance, FinanceCacheTTL)
			}
		}
	}

	// 3. Sports (only if user has an enabled sports stream)
	if enabledTypes["sports"] {
		if !GetCache(CacheKeySports, &res.Sports) {
			rows, err := dbPool.Query(context.Background(), fmt.Sprintf("SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT %d", DashboardSportsLimit))
			if err != nil {
				log.Printf("[Database Error] Dashboard sports query failed: %v", err)
			} else {
				defer rows.Close()
				for rows.Next() {
					var g Game
					if err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State); err != nil {
						log.Printf("[Database Error] Dashboard sports scan failed: %v", err)
						continue
					}
					res.Sports = append(res.Sports, g)
				}
				SetCache(CacheKeySports, res.Sports, SportsCacheTTL)
			}
		}
	}

	// 4. RSS (only if user has an enabled rss stream with feed URLs)
	if enabledTypes["rss"] {
		feedURLs := getUserRSSFeedURLs(userID)
		if len(feedURLs) > 0 {
			cacheKey := CacheKeyRSSPrefix + userID
			if !GetCache(cacheKey, &res.Rss) {
				res.Rss = queryRSSItems(feedURLs)
				if res.Rss == nil {
					res.Rss = make([]RssItem, 0)
				}
				SetCache(cacheKey, res.Rss, RSSItemsCacheTTL)
			}
		}
	}

	// 5. Yahoo Fantasy (only if user has an enabled fantasy stream and linked Yahoo account)
	if enabledTypes["fantasy"] {
		guid := getGuid(c)
		if guid != "" {
			cacheKey := CacheKeyYahooLeaguesPrefix + guid
			var yahooContent FantasyContent
			if GetCache(cacheKey, &yahooContent) {
				res.Yahoo = &yahooContent
			} else {
				var data []byte
				err := dbPool.QueryRow(context.Background(), "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
				if err == nil {
					if err := json.Unmarshal(data, &yahooContent); err == nil {
						res.Yahoo = &yahooContent
						SetCache(cacheKey, yahooContent, YahooCacheTTL)
					}
				}
			}
		}
	}

	return c.JSON(res)
}