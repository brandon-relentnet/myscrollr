package core

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

var proxyClient = &http.Client{
	Timeout: 30 * time.Second,
}

// SetupProxyRoutes creates Fiber routes that proxy to integration services.
// This should be called after initial discovery completes.
// Routes are re-created when integrations change.
func SetupProxyRoutes(app *fiber.App) {
	integrations := GetAllIntegrations()

	for _, intg := range integrations {
		for _, route := range intg.Routes {
			handler := createProxyHandler(intg, route)

			if route.Auth {
				// Wrap with LogtoAuth middleware for authenticated routes
				switch route.Method {
				case "GET":
					app.Get(route.Path, LogtoAuth, handler)
				case "POST":
					app.Post(route.Path, LogtoAuth, handler)
				case "PUT":
					app.Put(route.Path, LogtoAuth, handler)
				case "DELETE":
					app.Delete(route.Path, LogtoAuth, handler)
				}
			} else {
				switch route.Method {
				case "GET":
					app.Get(route.Path, handler)
				case "POST":
					app.Post(route.Path, handler)
				case "PUT":
					app.Put(route.Path, handler)
				case "DELETE":
					app.Delete(route.Path, handler)
				}
			}

			log.Printf("[Proxy] Registered %s %s -> %s (auth: %v)",
				route.Method, route.Path, intg.InternalURL, route.Auth)
		}
	}
}

func createProxyHandler(intg *IntegrationInfo, route IntegrationRoute) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Build the target URL
		// Replace Fiber route params in the path
		targetPath := route.Path
		// Handle Fiber-style params like :league_key, :team_key, :type
		for _, paramName := range c.Route().Params {
			paramValue := c.Params(paramName)
			targetPath = strings.Replace(targetPath, ":"+paramName, paramValue, 1)
		}

		targetURL := intg.InternalURL + targetPath

		// Forward query string
		if queryString := string(c.Request().URI().QueryString()); queryString != "" {
			targetURL += "?" + queryString
		}

		// Create the proxy request
		var bodyReader io.Reader
		if len(c.Body()) > 0 {
			bodyReader = strings.NewReader(string(c.Body()))
		}

		req, err := http.NewRequestWithContext(c.Context(), c.Method(), targetURL, bodyReader)
		if err != nil {
			log.Printf("[Proxy] Failed to create request for %s: %v", targetURL, err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"status": "error",
				"error":  "Failed to proxy request",
			})
		}

		// Forward content type
		if ct := c.Get("Content-Type"); ct != "" {
			req.Header.Set("Content-Type", ct)
		}

		// Forward authorization headers (for Yahoo token etc.)
		if auth := c.Get("Authorization"); auth != "" {
			req.Header.Set("Authorization", auth)
		}

		// Forward cookies (needed for Yahoo OAuth)
		if cookie := c.Get("Cookie"); cookie != "" {
			req.Header.Set("Cookie", cookie)
		}

		// Add user identity for authenticated routes
		if route.Auth {
			userID := GetUserID(c)
			if userID != "" {
				req.Header.Set("X-User-Sub", userID)
			}
		}

		// Execute the proxy request
		resp, err := proxyClient.Do(req)
		if err != nil {
			log.Printf("[Proxy] Request to %s failed: %v", targetURL, err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"status": "error",
				"error":  fmt.Sprintf("Integration %s is unavailable", intg.Name),
			})
		}
		defer resp.Body.Close()

		// Read the response body
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("[Proxy] Failed to read response from %s: %v", targetURL, err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"status": "error",
				"error":  "Failed to read integration response",
			})
		}

		// Forward response headers
		for key, values := range resp.Header {
			for _, value := range values {
				// Forward Set-Cookie and Location headers (important for OAuth)
				if strings.EqualFold(key, "Set-Cookie") ||
					strings.EqualFold(key, "Location") ||
					strings.EqualFold(key, "Content-Type") {
					c.Set(key, value)
				}
			}
		}

		// Return the response with the original status code
		return c.Status(resp.StatusCode).Send(body)
	}
}
