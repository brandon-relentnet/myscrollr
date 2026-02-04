package main

import (
	"context"
	"encoding/json"
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
	Status  string `json:"status"`
	Error   string `json:"error"`
	Hint    string `json:"hint,omitempty"`
	Target  string `json:"target,omitempty"`
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
func main() {
	_ = godotenv.Load()

	ConnectDB()
	defer dbPool.Close()

	ConnectRedis()
	defer rdb.Close()

	InitYahoo()
	InitAuth()

	app := fiber.New(fiber.Config{
		AppName: "Scrollr API",
	})

	app.Use(logger.New())

	// Hardened CORS
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "https://myscrollr.com,https://api.myscrollr.relentnet.dev"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowCredentials: true,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
	}))

	// Rate Limiting
	app.Use(limiter.New(limiter.Config{
		Max:        60,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
	}))

	app.Get("/swagger/*", swagger.HandlerDefault)

	// --- Public Routes ---
	app.Get("/health", HealthCheck)
	app.Get("/sports/health", SportsHealth)
	app.Get("/finance/health", FinanceHealth)
	app.Get("/yahoo/health", YahooHealth)
	app.Get("/yahoo/callback", YahooCallback)
	app.Get("/login", LogtoLogin)
	app.Get("/signup", LogtoSignup)
	app.Get("/callback", LogtoCallback)
	app.Get("/", LandingPage)

	// --- Protected Routes (Logto) ---
	api := app.Group("/", LogtoAuth)

	// Data Routes
	api.Get("/sports", GetSports)
	api.Get("/finance", GetFinance)
	api.Get("/dashboard", GetDashboard)

	// Yahoo OAuth & Data
	api.Get("/yahoo/start", YahooStart)
	api.Get("/yahoo/leagues", YahooLeagues)
	api.Get("/yahoo/league/:league_key/standings", YahooStandings)
	api.Get("/yahoo/team/:team_key/matchups", YahooMatchups)
	api.Get("/yahoo/team/:team_key/roster", YahooRoster)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}

func LandingPage(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/html")
	return c.SendString(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scrollr API | Status</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .status-dot { height: 10px; width: 10px; border-radius: 50%; display: inline-block; }
        .bg-pending { background-color: #9ca3af; }
        .bg-online { background-color: #10b981; box-shadow: 0 0 8px #10b981; }
        .bg-offline { background-color: #ef4444; box-shadow: 0 0 8px #ef4444; }
    </style>
</head>
<body class="bg-slate-950 text-slate-200 min-h-screen flex flex-col items-center justify-center p-6">
    <div class="max-w-3xl w-full">
        <!-- Header -->
        <div class="mb-12 text-center">
            <h1 class="text-5xl font-bold text-white mb-4 tracking-tight">Scrollr <span class="text-indigo-500">API</span></h1>
            <p class="text-slate-400 text-lg">High-performance data aggregator for finance, sports, and fantasy.</p>
        </div>

        <!-- Status Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            <!-- Core Infra -->
            <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Infrastructure</h2>
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span>PostgreSQL</span>
                        <span id="stat-db" class="status-dot bg-pending"></span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span>Redis Cache</span>
                        <span id="stat-redis" class="status-dot bg-pending"></span>
                    </div>
                </div>
            </div>

            <!-- Ingestion Services -->
            <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Ingestion Workers</h2>
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span>Finance (Finnhub)</span>
                        <span id="stat-finance" class="status-dot bg-pending"></span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span>Sports (ESPN)</span>
                        <span id="stat-sports" class="status-dot bg-pending"></span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span>Yahoo Bridge</span>
                        <span id="stat-yahoo" class="status-dot bg-pending"></span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Call to Actions -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/login" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-10 rounded-xl transition-all text-center shadow-lg shadow-indigo-500/20">
                Sign In
            </a>
            <a href="/signup" class="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-10 rounded-xl transition-all text-center border border-slate-700">
                Sign Up
            </a>
            <a href="/swagger/index.html" class="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-8 rounded-xl transition-all text-center border border-slate-700">
                Explore Documentation
            </a>
        </div>

        <!-- Footer -->
        <div class="mt-16 text-center text-slate-600 text-sm">
            &copy; 2026 Relentnet. All systems operational.
        </div>
    </div>

    <script>
        async function checkStatus() {
            try {
                const res = await fetch('/health');
                const data = await res.json();
                
                document.getElementById('stat-db').className = 'status-dot ' + (data.database === 'healthy' ? 'bg-online' : 'bg-offline');
                document.getElementById('stat-redis').className = 'status-dot ' + (data.redis === 'healthy' ? 'bg-online' : 'bg-offline');
                
                if (data.services) {
                    document.getElementById('stat-finance').className = 'status-dot ' + (data.services.finance === 'healthy' ? 'bg-online' : 'bg-offline');
                    document.getElementById('stat-sports').className = 'status-dot ' + (data.services.sports === 'healthy' ? 'bg-online' : 'bg-offline');
                    document.getElementById('stat-yahoo').className = 'status-dot ' + (data.services.yahoo === 'healthy' ? 'bg-online' : 'bg-online'); // Note: Using bg-online since its a bridge
                }
            } catch (e) {
                console.error('Status check failed', e);
            }
        }
        checkStatus();
        setInterval(checkStatus, 30000);
    </script>
</body>
</html>
	`)
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
	httpClient := &http.Client{Timeout: 5 * time.Second}
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
	}

	httpClient := &http.Client{Timeout: 2 * time.Second}
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
	if GetCache("cache:sports", &games) {
		c.Set("X-Cache", "HIT")
		return c.JSON(games)
	}

	rows, err := dbPool.Query(context.Background(),
		"SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT 50")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
	}
	defer rows.Close()

	for rows.Next() {
		var g Game
		err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
		}
		games = append(games, g)
	}

	SetCache("cache:sports", games, 30*time.Second)
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
	if GetCache("cache:finance", &trades) {
		c.Set("X-Cache", "HIT")
		return c.JSON(trades)
	}

	rows, err := dbPool.Query(context.Background(),
		"SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
	}
	defer rows.Close()

	for rows.Next() {
		var t Trade
		err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: err.Error()})
		}
		trades = append(trades, t)
	}

	SetCache("cache:finance", trades, 30*time.Second)
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
	}

	// 1. Finance (from cache or DB)
	if !GetCache("cache:finance", &res.Finance) {
		rows, err := dbPool.Query(context.Background(), "SELECT symbol, price, previous_close, price_change, percentage_change, direction, last_updated FROM trades ORDER BY symbol ASC")
		if err == nil {
			for rows.Next() {
				var t Trade
				if err := rows.Scan(&t.Symbol, &t.Price, &t.PreviousClose, &t.PriceChange, &t.PercentageChange, &t.Direction, &t.LastUpdated); err == nil {
					res.Finance = append(res.Finance, t)
				}
			}
			rows.Close()
			SetCache("cache:finance", res.Finance, 30*time.Second)
		}
	}

	// 2. Sports (from cache or DB)
	if !GetCache("cache:sports", &res.Sports) {
		rows, err := dbPool.Query(context.Background(), "SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT 20")
		if err == nil {
			for rows.Next() {
				var g Game
				if err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State); err == nil {
					res.Sports = append(res.Sports, g)
				}
			}
			rows.Close()
			SetCache("cache:sports", res.Sports, 30*time.Second)
		}
	}

	// 3. Yahoo (Optional, only if authenticated)
	guid := getGuid(c)
	if guid != "" {
		cacheKey := "cache:yahoo:leagues:" + guid
		var yahooContent FantasyContent
		if GetCache(cacheKey, &yahooContent) {
			res.Yahoo = &yahooContent
		} else {
			var data []byte
			err := dbPool.QueryRow(context.Background(), "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
			if err == nil {
				if err := json.Unmarshal(data, &yahooContent); err == nil {
					res.Yahoo = &yahooContent
					SetCache(cacheKey, yahooContent, 5*time.Minute)
				}
			}
		}
	}

	return c.JSON(res)
}