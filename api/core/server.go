package core

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/swagger"
)

// Server holds the Fiber app, integration registry, and shared dependencies.
type Server struct {
	App          *fiber.App
	integrations []integration.Integration
}

// NewServer creates a new Server with a configured Fiber app.
func NewServer() *Server {
	app := fiber.New(fiber.Config{
		AppName: "Scrollr API",
	})

	return &Server{
		App:          app,
		integrations: make([]integration.Integration, 0),
	}
}

// RegisterIntegration adds an integration to the server's registry.
func (s *Server) RegisterIntegration(intg integration.Integration) {
	s.integrations = append(s.integrations, intg)
	log.Printf("[Server] Registered integration: %s (%s)", intg.Name(), intg.DisplayName())
}

// Setup configures middleware, registers all routes, and initialises the
// integration registry globals.
func (s *Server) Setup() {
	// Publish the registry to the package-level variable so streams.go and
	// handlers_webhook.go can access it.
	IntegrationRegistry = s.integrations
	BuildValidStreamTypes()

	s.setupMiddleware()
	s.setupRoutes()
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

	// Build the set of rate-limit-exempt paths from integration health endpoints
	exemptPaths := map[string]bool{
		"/health":           true,
		"/events":           true,
		"/webhooks/sequin":  true,
		"/rss/feeds":        true,
	}
	for _, intg := range s.integrations {
		if _, ok := intg.(integration.HealthChecker); ok {
			healthPath := "/" + intg.Name() + "/health"
			exemptPaths[healthPath] = true
		}
	}

	s.App.Use(limiter.New(limiter.Config{
		Max:        RateLimitMax,
		Expiration: RateLimitExpiration,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		Next: func(c *fiber.Ctx) bool {
			return exemptPaths[c.Path()]
		},
	}))
}

// setupRoutes mounts public, protected, and integration-specific routes.
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

	s.App.Get("/", s.landingPage)

	// --- Protected Routes ---
	api := s.App.Group("/")

	api.Get("/dashboard", LogtoAuth, s.getDashboard)

	// User Routes
	api.Get("/users/:username", GetProfileByUsername)
	api.Get("/users/me/preferences", LogtoAuth, HandleGetPreferences)
	api.Put("/users/me/preferences", LogtoAuth, HandleUpdatePreferences)
	api.Get("/users/me/streams", LogtoAuth, GetStreams)
	api.Post("/users/me/streams", LogtoAuth, CreateStream)
	api.Put("/users/me/streams/:type", LogtoAuth, UpdateStream)
	api.Delete("/users/me/streams/:type", LogtoAuth, DeleteStream)

	// Let each integration register its own routes
	for _, intg := range s.integrations {
		intg.RegisterRoutes(s.App, LogtoAuth)
	}
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

	httpClient := &http.Client{Timeout: HealthCheckTimeout}
	for _, intg := range s.integrations {
		hc, ok := intg.(integration.HealthChecker)
		if !ok {
			continue
		}
		serviceURL := hc.InternalServiceURL()
		if serviceURL == "" {
			continue
		}
		targetURL := buildHealthURL(serviceURL)
		resp, err := httpClient.Get(targetURL)
		if err != nil || resp.StatusCode != http.StatusOK {
			res.Services[intg.Name()] = "down"
			res.Status = "degraded"
		} else {
			res.Services[intg.Name()] = "healthy"
		}
	}

	return c.JSON(res)
}

// getDashboard retrieves aggregated data for the user dashboard.
// @Summary Get aggregated dashboard data
// @Description Combines data from all enabled integrations in one call
// @Tags Data
// @Produce json
// @Success 200 {object} DashboardResponse
// @Security LogtoAuth
// @Router /dashboard [get]
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

	enabledStreams := make(map[string]integration.StreamInfo)
	for _, st := range streams {
		if st.Enabled {
			enabledStreams[st.StreamType] = integration.StreamInfo{
				StreamType: st.StreamType,
				Enabled:    st.Enabled,
				Config:     st.Config,
			}
		}
	}

	// Warm Redis subscription sets from current DB state
	go SyncStreamSubscriptions(userID)

	// 3. Ask each integration for its dashboard data
	ctx := context.Background()
	for _, intg := range s.integrations {
		info, ok := enabledStreams[intg.Name()]
		if !ok {
			continue
		}
		dp, ok := intg.(integration.DashboardProvider)
		if !ok {
			continue
		}
		data, err := dp.GetDashboardData(ctx, userID, info)
		if err != nil {
			log.Printf("[Dashboard] %s error: %v", intg.Name(), err)
			continue
		}
		if data != nil {
			res.Data[intg.Name()] = data
		}
	}

	return c.JSON(res)
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
			"health":   "/health",
			"docs":     "/swagger/index.html",
			"frontend": frontendURL,
			"status":   frontendURL + "/status",
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

// --- Helpers used by healthCheck ---

func buildHealthURL(baseURL string) string {
	url := strings.TrimSuffix(baseURL, "/")
	if !strings.HasSuffix(url, "/health") {
		url = url + "/health"
	}
	return url
}

// ProxyInternalHealth proxies a health check to an internal service URL.
// Exported so integration packages can use it for their health endpoints.
func ProxyInternalHealth(c *fiber.Ctx, internalURL string) error {
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
