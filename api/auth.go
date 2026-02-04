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
	jwks       *keyfunc.JWKS
	apiURL     string // Derived from COOLIFY_FQDN for audience validation
	logtoURL   string // Derived from COOLIFY_FQDN for issuer validation
)

func InitAuth() {
	fqdn := os.Getenv("COOLIFY_FQDN")
	if fqdn == "" {
		log.Println("[Security Warning] COOLIFY_FQDN not set, authentication will fail")
		return
	}
	fqdn = strings.TrimPrefix(fqdn, "https://")
	fqdn = strings.TrimPrefix(fqdn, "http://")
	fqdn = strings.TrimSuffix(fqdn, "/")

	// Derive URLs from FQDN
	apiURL = fmt.Sprintf("https://%s", fqdn)
	logtoURL = fmt.Sprintf("https://%s/oidc", fqdn)

	// Derive Logto JWKS URL from FQDN
	jwksURL := fmt.Sprintf("https://%s/oidc/jwks", fqdn)

	log.Printf("[Auth] Initializing with JWKS: %s", jwksURL)
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
		log.Printf("Failed to create JWKS from resource at %s: %s", jwksURL, err.Error())
	} else {
		log.Printf("Successfully initialized Logto JWKS from %s", jwksURL)
	}
}

// LogtoAuth is the middleware that validates the Logto JWT
func LogtoAuth(c *fiber.Ctx) error {
	tokenString := ""
	authHeader := c.Get("Authorization")

	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			tokenString = parts[1]
		}
	}

	// Fallback to cookie
	if tokenString == "" {
		tokenString = c.Cookies("access_token")
	}

	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Missing authentication",
		})
	}

	if jwks == nil {
		log.Println("[Auth Error] JWKS not initialized")
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication system not initialized",
		})
	}

	// Parse the token.
	token, err := jwt.Parse(tokenString, jwks.Keyfunc)
	if err != nil {
		log.Printf("[Auth Error] JWT Parse failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid or expired token",
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

	// Verify Issuer - derived from COOLIFY_FQDN
	if claims["iss"] != logtoURL {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid token issuer",
		})
	}

	// Verify Audience (API Resource Identifier) - derived from COOLIFY_FQDN
	aud, _ := claims["aud"].(string)
	if aud != apiURL {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid token audience",
		})
	}

	// Store user ID in context
	c.Locals("user_id", sub)

	// Also store email if available
	if email, ok := claims["email"].(string); ok {
		c.Locals("user_email", email)
	}

	return c.Next()
}
