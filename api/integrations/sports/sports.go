package sports

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Integration implements the core Integration interface plus CDCHandler,
// DashboardProvider, and HealthChecker for sports scores.
type Integration struct {
	db         *pgxpool.Pool
	sendToUser integration.SendToUserFunc
	routeToSub integration.RouteToStreamSubscribersFunc
}

// New creates a new Sports integration.
func New(db *pgxpool.Pool, sendToUser integration.SendToUserFunc, routeToSub integration.RouteToStreamSubscribersFunc) *Integration {
	return &Integration{
		db:         db,
		sendToUser: sendToUser,
		routeToSub: routeToSub,
	}
}

// --- Core Interface ---

func (s *Integration) Name() string       { return "sports" }
func (s *Integration) DisplayName() string { return "Sports" }

func (s *Integration) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	router.Get("/sports/health", s.healthHandler)
	router.Get("/sports", authMiddleware, s.getSports)
}

// --- CDCHandler ---

func (s *Integration) HandlesTable(tableName string) bool {
	return tableName == "games"
}

func (s *Integration) RouteCDCRecord(ctx context.Context, record integration.CDCRecord, payload []byte) error {
	s.routeToSub(ctx, core.RedisStreamSubscribersPrefix+"sports", payload)
	return nil
}

// --- DashboardProvider ---

func (s *Integration) GetDashboardData(ctx context.Context, userSub string, stream integration.StreamInfo) (interface{}, error) {
	var games []core.Game
	if core.GetCache(core.CacheKeySports, &games) {
		return games, nil
	}

	rows, err := s.db.Query(ctx, fmt.Sprintf("SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT %d", core.DashboardSportsLimit))
	if err != nil {
		return nil, fmt.Errorf("sports query failed: %w", err)
	}
	defer rows.Close()

	games = make([]core.Game, 0)
	for rows.Next() {
		var g core.Game
		if err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State); err != nil {
			log.Printf("[Sports] Dashboard scan failed: %v", err)
			continue
		}
		games = append(games, g)
	}

	core.SetCache(core.CacheKeySports, games, core.SportsCacheTTL)
	return games, nil
}

// --- HealthChecker ---

func (s *Integration) InternalServiceURL() string { return os.Getenv("INTERNAL_SPORTS_URL") }

// --- HTTP Handlers ---

func (s *Integration) healthHandler(c *fiber.Ctx) error {
	return core.ProxyInternalHealth(c, s.InternalServiceURL())
}

// getSports retrieves the latest sports games.
// @Summary Get latest sports games
// @Description Fetches latest 50 games with 30s caching
// @Tags Data
// @Produce json
// @Success 200 {array} core.Game
// @Security LogtoAuth
// @Router /sports [get]
func (s *Integration) getSports(c *fiber.Ctx) error {
	var games []core.Game
	if core.GetCache(core.CacheKeySports, &games) {
		c.Set("X-Cache", "HIT")
		return c.JSON(games)
	}

	rows, err := s.db.Query(context.Background(),
		fmt.Sprintf("SELECT id, league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state FROM games ORDER BY start_time DESC LIMIT %d", core.DefaultSportsLimit))
	if err != nil {
		log.Printf("[Database Error] GetSports query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Internal server error"})
	}
	defer rows.Close()

	games = make([]core.Game, 0)
	for rows.Next() {
		var g core.Game
		if err := rows.Scan(&g.ID, &g.League, &g.ExternalGameID, &g.Link, &g.HomeTeamName, &g.HomeTeamLogo, &g.HomeTeamScore, &g.AwayTeamName, &g.AwayTeamLogo, &g.AwayTeamScore, &g.StartTime, &g.ShortDetail, &g.State); err != nil {
			log.Printf("[Database Error] GetSports scan failed: %v", err)
			continue
		}
		games = append(games, g)
	}

	core.SetCache(core.CacheKeySports, games, core.SportsCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(games)
}
