package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/oauth2"
)

var yahooConfig *oauth2.Config

func InitYahoo() {
	yahooConfig = &oauth2.Config{
		ClientID:     os.Getenv("YAHOO_CLIENT_ID"),
		ClientSecret: os.Getenv("YAHOO_CLIENT_SECRET"),
		Scopes:       []string{"fspt-r"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://api.login.yahoo.com/oauth2/request_auth",
			TokenURL: "https://api.login.yahoo.com/oauth2/get_token",
		},
		RedirectURL: fmt.Sprintf("https://%s%s", os.Getenv("DOMAIN_NAME"), os.Getenv("YAHOO_CALLBACK_URL")),
	}
}

// YahooStart godoc
// @Summary Start Yahoo OAuth2 flow.
// @Description Redirects the user to Yahoo for authentication.
// @Tags Yahoo
// @Success 307
// @Router /yahoo/start [get]
func YahooStart(c *fiber.Ctx) error {
	// Generate random state for CSRF protection
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)

	// Store state in Redis with 10 minute expiration
	err := rdb.Set(context.Background(), "csrf:"+state, "1", 10*time.Minute).Err()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store state"})
	}

	url := yahooConfig.AuthCodeURL(state)
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

	// Validate state via Redis
	val, err := rdb.GetDel(context.Background(), "csrf:"+state).Result()
	if err != nil || val == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid or expired state"})
	}

	// Exchange code for token
	token, err := yahooConfig.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to exchange code"})
	}

	// Build response similar to Rust implementation
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
                        console.error("Error sending token:", e);
                    }
                    setTimeout(function(){ window.close(); }, 1500);
                })();
                </script>
                <p>Authentication successful. You can close this window.</p>
            </body></html>`, token.AccessToken, token.RefreshToken)

	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(html)
}
