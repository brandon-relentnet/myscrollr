package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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
		log.Fatal("LOGTO_JWKS_URL environment variable is not set")
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

	// Verify Issuer
	issuer := os.Getenv("LOGTO_ISSUER")
	if issuer == "" {
		log.Println("[Security Warning] LOGTO_ISSUER not set, authentication will fail")
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
		log.Println("[Security Warning] LOGTO_ENDPOINT not set")
	}
	appID := os.Getenv("LOGTO_APP_ID")
	
	domain := os.Getenv("DOMAIN_NAME")
	if domain == "" { domain = os.Getenv("COOLIFY_FQDN") }
	if domain == "" {
		log.Println("[Security Warning] DOMAIN_NAME or COOLIFY_FQDN not set, redirect_uri may be invalid")
	}
	
	redirectURI := fmt.Sprintf("https://%s/callback", strings.TrimPrefix(domain, "https://"))
	
	// --- CSRF State Generation ---
	stateBuf := make([]byte, 16)
	rand.Read(stateBuf)
	state := hex.EncodeToString(stateBuf)

	// Store state in Redis (consistent with Yahoo flow)
	err := rdb.Set(context.Background(), "logto_csrf:"+state, "1", 10*time.Minute).Err()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString("Internal Server Error: Failed to store auth state")
	}

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
	authURL := fmt.Sprintf("%s/oidc/auth?client_id=%s&response_type=code&scope=openid&redirect_uri=%s&state=%s&code_challenge=%s&code_challenge_method=S256", 
		endpoint, appID, url.QueryEscape(redirectURI), state, challenge)
	
	// Add mode (signIn or signUp)
	authURL = fmt.Sprintf("%s&mode=%s", authURL, mode)
	
	resource := os.Getenv("LOGTO_API_RESOURCE")
	if resource != "" {
		authURL = fmt.Sprintf("%s&resource=%s", authURL, resource)
	}

	return c.Redirect(authURL)
}

// LogtoCallback handles the redirect from Logto, exchanges the code for tokens, and sets a secure cookie
func LogtoCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	if state == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Auth Failed: Missing state"})
	}

	// Validate state against Redis
	val, err := rdb.GetDel(context.Background(), "logto_csrf:"+state).Result()
	if err != nil || val == "" {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{Status: "error", Error: "Auth Failed: Invalid or expired state"})
	}

	code := c.Query("code")
	if code == "" {
		errorMsg := c.Query("error")
		desc := c.Query("error_description")
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: fmt.Sprintf("%s - %s", errorMsg, desc)})
	}

	// Get verifier from cookie
	verifier := c.Cookies("logto_verifier")
	if verifier == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Auth Failed: Missing verifier"})
	}

	// Clear the verifier cookie immediately
	c.Cookie(&fiber.Cookie{
		Name:     "logto_verifier",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Lax",
		Path:     "/",
	})

	// Exchange code for tokens
	endpoint := os.Getenv("LOGTO_ENDPOINT")
	if endpoint == "" {
		log.Println("[Security Warning] LOGTO_ENDPOINT not set during callback")
	}
	appID := os.Getenv("LOGTO_APP_ID")
	appSecret := os.Getenv("LOGTO_APP_SECRET") // Optional, but recommended for backend

	domain := os.Getenv("DOMAIN_NAME")
	if domain == "" { domain = os.Getenv("COOLIFY_FQDN") }
	if domain == "" {
		log.Println("[Security Warning] DOMAIN_NAME or COOLIFY_FQDN not set during callback")
	}
	redirectURI := fmt.Sprintf("https://%s/callback", strings.TrimPrefix(domain, "https://"))

	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("redirect_uri", redirectURI)
	data.Set("client_id", appID)
	data.Set("code_verifier", verifier)
	if appSecret != "" {
		data.Set("client_secret", appSecret)
	}

	tokenEndpoint := fmt.Sprintf("%s/oidc/token", strings.TrimSuffix(endpoint, "/"))
	resp, err := http.PostForm(tokenEndpoint, data)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to exchange token"})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		log.Printf("[Auth Error] Logto token exchange failed: %s", string(body))
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Authentication failed during token exchange"})
	}

	var tokenRes struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenRes); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to parse token response"})
	}

	// Set the access token in a secure, HttpOnly cookie
	c.Cookie(&fiber.Cookie{
		Name:     "access_token",
		Value:    tokenRes.AccessToken,
		Expires:  time.Now().Add(time.Duration(tokenRes.ExpiresIn) * time.Second),
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Strict",
		Path:     "/",
	})

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "https://myscrollr.com"
	}

	return c.Redirect(frontendURL)
}
