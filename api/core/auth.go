package core

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var (
	jwks *keyfunc.JWKS
)

// InitAuth initialises the JWKS keyfunc for JWT validation.
func InitAuth() {
	jwksURL := os.Getenv("LOGTO_JWKS_URL")
	if jwksURL == "" {
		fqdn := CleanFQDN()
		if fqdn == "" {
			log.Println("[Security Warning] COOLIFY_FQDN not set, authentication will fail")
			return
		}
		jwksURL = fmt.Sprintf("https://%s/oidc/jwks", fqdn)
	}

	log.Printf("[Auth] Initializing with JWKS: %s", jwksURL)
	var err error
	jwks, err = keyfunc.Get(jwksURL, keyfunc.Options{
		RefreshErrorHandler: func(err error) {
			log.Printf("There was an error with the jwt.Keyfunc refresh: %s", err.Error())
		},
		RefreshInterval:   JWKSRefreshInterval,
		RefreshRateLimit:  JWKSRefreshRateLimit,
		RefreshTimeout:    JWKSRefreshTimeout,
		RefreshUnknownKID: true,
	})
	if err != nil {
		log.Fatalf("Failed to create JWKS from resource at %s: %s", jwksURL, err.Error())
	}
	log.Printf("Successfully initialized Logto JWKS from %s", jwksURL)
}

// ValidateToken validates a JWT token string and returns the subject (user ID)
// and the full claims map.
func ValidateToken(tokenString string) (sub string, claims jwt.MapClaims, err error) {
	if jwks == nil {
		return "", nil, fmt.Errorf("JWKS not initialized")
	}

	token, err := jwt.Parse(tokenString, jwks.Keyfunc)
	if err != nil {
		return "", nil, fmt.Errorf("JWT parse failed: %w", err)
	}

	if !token.Valid {
		return "", nil, fmt.Errorf("token is not valid")
	}

	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", nil, fmt.Errorf("invalid token claims")
	}

	sub, ok = mapClaims["sub"].(string)
	if !ok {
		return "", nil, fmt.Errorf("token missing 'sub' claim")
	}

	expectedIssuer := os.Getenv("LOGTO_URL")
	if expectedIssuer == "" {
		if fqdn := CleanFQDN(); fqdn != "" {
			expectedIssuer = fmt.Sprintf("https://%s/oidc", fqdn)
		}
	}
	if expectedIssuer != "" && mapClaims["iss"] != expectedIssuer {
		return "", nil, fmt.Errorf("invalid token issuer")
	}

	expectedAudience := os.Getenv("API_URL")
	if expectedAudience == "" {
		if fqdn := CleanFQDN(); fqdn != "" {
			expectedAudience = fmt.Sprintf("https://%s", fqdn)
		}
	}
	audValid := false
	switch audClaim := mapClaims["aud"].(type) {
	case string:
		audValid = audClaim == expectedAudience
	case []interface{}:
		for _, a := range audClaim {
			if s, ok := a.(string); ok && s == expectedAudience {
				audValid = true
				break
			}
		}
	}
	if expectedAudience != "" && !audValid {
		return "", nil, fmt.Errorf("invalid token audience")
	}

	return sub, mapClaims, nil
}

// ValidateAuth extracts and validates the JWT from the request, setting
// user_id and user_roles in c.Locals. It does NOT call c.Next(), making it
// safe to use inline (e.g. from the dynamic proxy) without advancing
// Fiber's handler chain.
func ValidateAuth(c *fiber.Ctx) error {
	tokenString := ""
	authHeader := c.Get("Authorization")

	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			tokenString = parts[1]
		}
	}

	if tokenString == "" {
		tokenString = c.Cookies("access_token")
	}

	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Missing authentication",
		})
	}

	sub, claims, err := ValidateToken(tokenString)
	if err != nil {
		log.Printf("[Auth Error] %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid or expired token",
		})
	}

	c.Locals("user_id", sub)

	// Extract roles injected by Logto Custom JWT (e.g. ["uplink"])
	var roles []string
	if rawRoles, ok := claims["roles"]; ok {
		if roleSlice, ok := rawRoles.([]interface{}); ok {
			for _, r := range roleSlice {
				if s, ok := r.(string); ok {
					roles = append(roles, s)
				}
			}
		}
	}
	c.Locals("user_roles", roles)

	return nil
}

// LogtoAuth is the Fiber middleware that validates the Logto JWT and advances
// to the next handler. For inline auth checks (e.g. in the dynamic proxy),
// use ValidateAuth instead.
func LogtoAuth(c *fiber.Ctx) error {
	if err := ValidateAuth(c); err != nil {
		return err
	}
	return c.Next()
}
