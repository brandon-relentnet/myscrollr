package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"log"
	"net/url"
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
	return initiateLogtoAuth(c, "signIn")
}

// LogtoSignup redirects the user to the Logto sign-up page
func LogtoSignup(c *fiber.Ctx) error {
	return initiateLogtoAuth(c, "signUp")
}

func initiateLogtoAuth(c *fiber.Ctx, mode string) error {
	endpoint := os.Getenv("LOGTO_ENDPOINT")
	if endpoint == "" {
		endpoint = "https://auth.myscrollr.relentnet.dev"
	}
	appID := os.Getenv("LOGTO_APP_ID")
	
	domain := os.Getenv("DOMAIN_NAME")
	if domain == "" { domain = os.Getenv("COOLIFY_FQDN") }
	if domain == "" { domain = "api.myscrollr.relentnet.dev" }
	
	redirectURI := fmt.Sprintf("https://%s/callback", strings.TrimPrefix(domain, "https://"))
	
	// --- PKCE Generation ---
	// 1. Generate Verifier
	verifierBuf := make([]byte, 32)
	rand.Read(verifierBuf)
	verifier := base64.RawURLEncoding.EncodeToString(verifierBuf)

	// 2. Generate Challenge (S256)
	hash := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(hash[:])

	// 3. Store verifier in cookie for the callback
	c.Cookie(&fiber.Cookie{
		Name:     "logto_verifier",
		Value:    verifier,
		Expires:  time.Now().Add(10 * time.Minute),
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Lax",
		Path:     "/",
	})

	// Base OIDC URL
	authURL := fmt.Sprintf("%s/oidc/auth?client_id=%s&response_type=code&scope=openid&redirect_uri=%s&state=mystate&code_challenge=%s&code_challenge_method=S256", 
		endpoint, appID, url.QueryEscape(redirectURI), challenge)
	
	// Add mode (signIn or signUp)
	authURL = fmt.Sprintf("%s&mode=%s", authURL, mode)
	
	resource := os.Getenv("LOGTO_API_RESOURCE")
	if resource != "" {
		authURL = fmt.Sprintf("%s&resource=%s", authURL, resource)
	}

	return c.Redirect(authURL)
}

// LogtoCallback handles the redirect from Logto and displays the code (for testing)
func LogtoCallback(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		errorMsg := c.Query("error")
		desc := c.Query("error_description")
		return c.Status(fiber.StatusBadRequest).SendString(fmt.Sprintf("Auth Failed: %s - %s", errorMsg, desc))
	}

	return c.SendString(fmt.Sprintf("Success! Logto returned a code: %s\n\nYour API is now ready to receive JWTs from your frontend.", code))
}
