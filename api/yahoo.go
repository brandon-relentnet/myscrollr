package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/oauth2"
)

var yahooConfig *oauth2.Config

func InitYahoo() {
	clientID := os.Getenv("YAHOO_CLIENT_ID")
	clientSecret := os.Getenv("YAHOO_CLIENT_SECRET")
	
	// Try DOMAIN_NAME first, then fall back to COOLIFY_FQDN
	domain := os.Getenv("DOMAIN_NAME")
	if domain == "" {
		domain = os.Getenv("COOLIFY_FQDN")
	}

	// Clean up domain: strip protocol if user accidentally included it
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")

	callbackPath := os.Getenv("YAHOO_CALLBACK_URL")
	if callbackPath == "" {
		callbackPath = "/yahoo/callback"
	}

	// Ensure callback path starts with /
	if !strings.HasPrefix(callbackPath, "/") {
		callbackPath = "/" + callbackPath
	}

	if domain == "" {
		log.Println("[Yahoo Warning] No domain found in DOMAIN_NAME or COOLIFY_FQDN. Redirects will fail.")
	}

	redirectURL := fmt.Sprintf("https://%s%s", domain, callbackPath)

	log.Printf("[Yahoo Init] Client ID: %s... Redirect URI: %s", clientID[:5], redirectURL)

	yahooConfig = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Scopes:       []string{"fspt-r"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://api.login.yahoo.com/oauth2/request_auth",
			TokenURL: "https://api.login.yahoo.com/oauth2/get_token",
		},
		RedirectURL: redirectURL,
	}
}

// YahooStart godoc
// @Summary Start Yahoo OAuth2 flow.
// @Description Redirects the user to Yahoo for authentication.
// @Tags Yahoo
// @Success 307
// @Router /yahoo/start [get]
func YahooStart(c *fiber.Ctx) error {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)

	err := rdb.Set(context.Background(), "csrf:"+state, "1", 10*time.Minute).Err()
	if err != nil {
		log.Printf("[Yahoo Error] Redis storage failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store state"})
	}

	url := yahooConfig.AuthCodeURL(state)
	log.Printf("[Yahoo Auth] Generating URL: %s", url)
	
	return c.Redirect(url, fiber.StatusTemporaryRedirect)
}

// YahooCallback godoc
// @Summary Handle Yahoo OAuth2 callback.
// @Description Validates state and exchanges code for tokens.
// @Tags Yahoo
// @Param code query string true "Auth Code"
// @Param state query string true "CSRF State"
// @Success 200 {string} string "HTML script to post message back"
// @Router /yahoo/callback [get]
func YahooCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	code := c.Query("code")

	log.Printf("[Yahoo Callback] Received state: %s, code length: %d", state, len(code))

	val, err := rdb.GetDel(context.Background(), "csrf:"+state).Result()
	if err != nil || val == "" {
		log.Printf("[Yahoo Error] State validation failed for: %s", state)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid or expired state"})
	}

	token, err := yahooConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("[Yahoo Error] Token exchange failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to exchange code"})
	}

	// Set Cookies for browser testing
	c.Cookie(&fiber.Cookie{
		Name:     "yahoo-auth",
		Value:    token.AccessToken,
		Expires:  time.Now().Add(24 * time.Hour),
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Lax",
		Path:     "/",
	})

	if token.RefreshToken != "" {
		c.Cookie(&fiber.Cookie{
			Name:     "yahoo-refresh",
			Value:    token.RefreshToken,
			Expires:  time.Now().Add(30 * 24 * time.Hour),
			HTTPOnly: true,
			Secure:   true,
			SameSite: "Lax",
			Path:     "/",
		})
	}

	html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Complete</title></head>
            <body style="font-family: ui-sans-serif, system-ui;">
                <script>
                (function() { 
                    try { 
                        if (window.opener) { 
                            window.opener.postMessage({ 
                                type: 'yahoo-auth', 
                                accessToken: '%s',
                                refreshToken: '%s'
                            }, '*'); 
                        }
                    } catch(e) { 
                        log.error("Error sending token:", e);
                    }
                    setTimeout(function(){ window.close(); }, 1500);
                })();
                </script>
                <p>Authentication successful. Cookies set. You can close this window or go to /yahoo/leagues.</p>
            </body></html>`, token.AccessToken, token.RefreshToken)

	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(html)
}

// YahooLeagues godoc
// @Summary Get Yahoo user leagues.
// @Description Fetches the authenticated user's leagues from Yahoo.
// @Tags Yahoo
// @Success 200 {string} string "XML response from Yahoo"
// @Router /yahoo/leagues [get]
func YahooLeagues(c *fiber.Ctx) error {
	token := c.Cookies("yahoo-auth")
	if token == "" {
		authHeader := c.Get("Authorization")
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			token = authHeader[7:]
		}
	}

	if token == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized, missing token"})
	}

	client := &http.Client{}
	req, _ := http.NewRequest("GET", "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl,nba,nhl/leagues", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch from Yahoo"})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	c.Set("Content-Type", "application/xml")
	return c.Send(body)
}