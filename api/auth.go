package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var (
	jwks *keyfunc.JWKS
)

func InitAuth() {
	jwksURL := os.Getenv("LOGTO_JWKS_URL")
	if jwksURL == "" {
		// Fallback to your specific instance
		jwksURL = "https://auth.myscrollr.relentnet.dev/oidc/jwks"
	}

	// Create the JWKS from the resource at the given URL.
	var err error
	jwks, err = keyfunc.Get(jwksURL, keyfunc.Options{
		RefreshErrorHandler: func(err error) {
			log.Printf("There was an error with the jwt.Keyfunc refresh: %s", err.Error())
		},
		RefreshInterval:   time.Hour,
		RefreshRateLimit:  time.Minute * 5,
		RefreshTimeout:    time.Second * 10,
		RefreshUnknownKID: true,
	})
	if err != nil {
		log.Fatalf("Failed to create JWKS from resource at %s: %s", jwksURL, err.Error())
	}
	log.Printf("Successfully initialized Logto JWKS from %s", jwksURL)
}

// LogtoAuth is the middleware that validates the Logto JWT
func LogtoAuth(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Missing Authorization header",
		})
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid Authorization header format",
		})
	}

	tokenString := parts[1]

	// Parse the token.
	token, err := jwt.Parse(tokenString, jwks.Keyfunc)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  fmt.Sprintf("Invalid token: %s", err.Error()),
		})
	}

	if !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Token is not valid",
		})
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid token claims",
		})
	}

	// Extract Logto User ID (sub)
	sub, ok := claims["sub"].(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Token missing 'sub' claim",
		})
	}

	// Verify Issuer
	issuer := os.Getenv("LOGTO_ISSUER")
	if issuer == "" {
		issuer = "https://auth.myscrollr.relentnet.dev/oidc"
	}
	if claims["iss"] != issuer {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid token issuer",
		})
	}

	// Verify Audience (API Resource Identifier)
	audience := os.Getenv("LOGTO_API_RESOURCE")
	if audience != "" {
		aud, _ := claims["aud"].(string)
		if aud != audience {
			return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
				Status: "unauthorized",
				Error:  "Invalid token audience",
			})
		}
	}

	// Store user ID in context
	c.Locals("user_id", sub)
	
	// Also store email if available
	if email, ok := claims["email"].(string); ok {
		c.Locals("user_email", email)
	}

	return c.Next()
}

func getLogtoUserId(c *fiber.Ctx) string {
	val := c.Locals("user_id")
	if val == nil {
		return ""
	}
	return val.(string)
}

func getLogtoEmail(c *fiber.Ctx) string {
	val := c.Locals("user_email")
	if val == nil {
		return ""
	}
	return val.(string)
}

// LogtoLogin redirects the user to the Logto sign-in page
func LogtoLogin(c *fiber.Ctx) error {
	endpoint := os.Getenv("LOGTO_ENDPOINT")
	if endpoint == "" {
		endpoint = "https://auth.myscrollr.relentnet.dev"
	}
	appID := os.Getenv("LOGTO_APP_ID")
	
	// Construct the redirect URI (this API's callback)
	domain := os.Getenv("DOMAIN_NAME")
	if domain == "" { domain = os.Getenv("COOLIFY_FQDN") }
	if domain == "" { domain = "api.myscrollr.relentnet.dev" } // fallback
	
	redirectURI := fmt.Sprintf("https://%s/callback", strings.TrimPrefix(domain, "https://"))
	
	// OIDC Authorization URL
	authURL := fmt.Sprintf("%s/oidc/auth?client_id=%s&response_type=code&scope=openid+profile+email&redirect_uri=%s&state=mystate", 
		endpoint, appID, redirectURI)
	
	// Add API Resource if configured
	resource := os.Getenv("LOGTO_API_RESOURCE")
	if resource != "" {
		authURL = fmt.Sprintf("%s&resource=%s", authURL, resource)
	}

	return c.Redirect(authURL)
}

// LogtoCallback handles the redirect from Logto and displays the tokens (for testing)
func LogtoCallback(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Status(fiber.StatusBadRequest).SendString("Missing code")
	}

	// In a real app, the frontend would exchange this code.
	// For testing, we just show the code.
	return c.SendString(fmt.Sprintf("Login Successful! Code: %s\n\nYou can now use this code to get an Access Token, or if your frontend is setup, it will handle this.", code))
}
