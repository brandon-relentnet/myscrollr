package core

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/swagger"
)

// Server holds the Fiber app and shared dependencies.
type Server struct {
	App *fiber.App
}

// NewServer creates a new Server with a configured Fiber app.
func NewServer() *Server {
	app := fiber.New(fiber.Config{
		AppName: "Scrollr API",
	})

	return &Server{
		App: app,
	}
}

// Setup configures middleware, registers all routes, and sets up integration
// proxying based on Redis discovery.
func (s *Server) Setup() {
	s.setupMiddleware()
	s.setupRoutes()

	// Setup dynamic catch-all proxy for integration routes.
	// MUST be last — Fiber matches in registration order, so core routes take priority.
	SetupDynamicProxy(s.App)
}

// setupMiddleware attaches logging, security headers, CORS, and rate limiting.
func (s *Server) setupMiddleware() {
	s.App.Use(logger.New())

	// Security Headers
	s.App.Use(func(c *fiber.Ctx) error {
		c.Set("X-XSS-Protection", "1; mode=block")
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Download-Options", "noopen")
		c.Set("Strict-Transport-Security", fmt.Sprintf("max-age=%d; includeSubDomains", HSTSMaxAge))
		c.Set("X-Frame-Options", "SAMEORIGIN")
		c.Set("X-DNS-Prefetch-Control", "off")
		if strings.HasPrefix(c.Path(), "/swagger") {
			c.Set("Content-Security-Policy", "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com")
		} else {
			c.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}
		return c.Next()
	})

	// CORS
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = DefaultAllowedOrigins
	} else {
		origins := strings.Split(allowedOrigins, ",")
		for i, o := range origins {
			origins[i] = ValidateURL(o, "")
		}
		allowedOrigins = strings.Join(origins, ",")
	}

	s.App.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowCredentials: true,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
	}))

	// Core paths always exempt from rate limiting
	coreExemptPaths := map[string]bool{
		"/health":          true,
		"/events":          true,
		"/webhooks/sequin": true,
		"/integrations":    true,
	}

	s.App.Use(limiter.New(limiter.Config{
		Max:        RateLimitMax,
		Expiration: RateLimitExpiration,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		Next: func(c *fiber.Ctx) bool {
			path := c.Path()
			// Always exempt core paths
			if coreExemptPaths[path] {
				return true
			}
			// Dynamically check integration routes (handles late-discovered integrations)
			for _, entry := range GetIntegrationRoutes() {
				if !entry.Route.Auth {
					if _, ok := matchRoute(entry.Route.Path, path); ok {
						return true
					}
				}
			}
			return false
		},
	}))
}

// setupRoutes mounts core public and protected routes.
// Integration-specific routes are handled by SetupProxyRoutes.
func (s *Server) setupRoutes() {
	s.App.Get("/swagger/*", swagger.HandlerDefault)

	// --- Public Routes ---
	s.App.Get("/health", s.healthCheck)
	s.App.Get("/events", StreamEvents)
	s.App.Get("/events/count", GetActiveViewers)
	s.App.Post("/webhooks/sequin", HandleSequinWebhook)

	// Extension auth proxy
	s.App.Options("/extension/token", HandleExtensionAuthPreflight)
	s.App.Post("/extension/token", HandleExtensionTokenExchange)
	s.App.Options("/extension/token/refresh", HandleExtensionAuthPreflight)
	s.App.Post("/extension/token/refresh", HandleExtensionTokenRefresh)

	s.App.Get("/integrations", s.listIntegrations)
	s.App.Get("/", s.landingPage)

	// --- Protected Routes ---
	s.App.Get("/dashboard", LogtoAuth, s.getDashboard)

	// User Routes — specific /users/me/* paths BEFORE parameterized /users/:username
	s.App.Get("/users/me/preferences", LogtoAuth, HandleGetPreferences)
	s.App.Put("/users/me/preferences", LogtoAuth, HandleUpdatePreferences)
	s.App.Get("/users/me/streams", LogtoAuth, GetStreams)
	s.App.Post("/users/me/streams", LogtoAuth, CreateStream)
	s.App.Put("/users/me/streams/:type", LogtoAuth, UpdateStream)
	s.App.Delete("/users/me/streams/:type", LogtoAuth, DeleteStream)
	s.App.Get("/users/:username", GetProfileByUsername)
}

// healthCheck returns the aggregated health status.
func (s *Server) healthCheck(c *fiber.Ctx) error {
	res := HealthResponse{Status: "healthy", Services: make(map[string]string)}

	if err := DBPool.Ping(context.Background()); err != nil {
		res.Database = "unhealthy"
		res.Status = "degraded"
	} else {
		res.Database = "healthy"
	}
	if err := Rdb.Ping(context.Background()).Err(); err != nil {
		res.Redis = "unhealthy"
		res.Status = "degraded"
	} else {
		res.Redis = "healthy"
	}

	// Check health of discovered integration services
	httpClient := &http.Client{Timeout: HealthCheckTimeout}
	for _, intg := range GetAllIntegrations() {
		if !intg.HasCapability("health_checker") {
			continue
		}
		targetURL := intg.InternalURL + "/internal/health"
		resp, err := httpClient.Get(targetURL)
		if err != nil || resp.StatusCode != http.StatusOK {
			res.Services[intg.Name] = "down"
			res.Status = "degraded"
		} else {
			res.Services[intg.Name] = "healthy"
			resp.Body.Close()
		}
	}

	return c.JSON(res)
}

// getDashboard retrieves aggregated data for the user dashboard.
func (s *Server) getDashboard(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	res := DashboardResponse{
		Data: make(map[string]interface{}),
	}

	// 1. User preferences
	prefs, err := GetOrCreatePreferences(userID)
	if err == nil {
		res.Preferences = prefs
	}

	// 2. User streams + enabled types
	streams, err := GetUserStreams(userID)
	if err == nil {
		res.Streams = streams
	}

	enabledStreams := make(map[string]bool)
	for _, st := range streams {
		if st.Enabled {
			enabledStreams[st.StreamType] = true
		}
	}

	// Warm Redis subscription sets from current DB state
	go SyncStreamSubscriptions(userID)

	// 3. Fetch dashboard data from each enabled integration via HTTP
	dashboardClient := &http.Client{Timeout: HealthCheckTimeout}
	for _, intg := range GetAllIntegrations() {
		if !enabledStreams[intg.Name] {
			continue
		}
		if !intg.HasCapability("dashboard_provider") {
			continue
		}

		url := fmt.Sprintf("%s/internal/dashboard?user=%s", intg.InternalURL, userID)
		resp, err := dashboardClient.Get(url)
		if err != nil {
			log.Printf("[Dashboard] %s fetch error: %v", intg.Name, err)
			continue
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil || resp.StatusCode != 200 {
			log.Printf("[Dashboard] %s returned status %d", intg.Name, resp.StatusCode)
			continue
		}

		// Merge integration data into response
		var data map[string]interface{}
		if err := json.Unmarshal(body, &data); err != nil {
			log.Printf("[Dashboard] %s unmarshal error: %v", intg.Name, err)
			continue
		}
		for k, v := range data {
			res.Data[k] = v
		}
	}

	return c.JSON(res)
}

// listIntegrations returns all discovered integrations and their capabilities.
func (s *Server) listIntegrations(c *fiber.Ctx) error {
	integrations := GetAllIntegrations()
	infos := make([]fiber.Map, 0, len(integrations))
	for _, intg := range integrations {
		infos = append(infos, fiber.Map{
			"name":         intg.Name,
			"display_name": intg.DisplayName,
			"capabilities": intg.Capabilities,
		})
	}
	return c.JSON(infos)
}

// landingPage returns basic API info.
func (s *Server) landingPage(c *fiber.Ctx) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = DefaultFrontendURL
	}

	return c.JSON(fiber.Map{
		"name":    "Scrollr API",
		"version": "1.0",
		"status":  "operational",
		"links": fiber.Map{
			"health":       "/health",
			"integrations": "/integrations",
			"docs":         "/swagger/index.html",
			"frontend":     frontendURL,
			"status":       frontendURL + "/status",
		},
	})
}

// Listen starts the HTTP server on the configured port.
func (s *Server) Listen() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	log.Printf("Starting server on port %s", port)
	return s.App.Listen(":" + port)
}


