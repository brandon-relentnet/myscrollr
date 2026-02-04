package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
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
	
	domain := os.Getenv("DOMAIN_NAME")
	if domain == "" {
		domain = os.Getenv("COOLIFY_FQDN")
	}

	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")

	callbackPath := os.Getenv("YAHOO_CALLBACK_URL")
	if callbackPath == "" {
		callbackPath = "/yahoo/callback"
	}

	if !strings.HasPrefix(callbackPath, "/") {
		callbackPath = "/" + callbackPath
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

// Helper to get token from cookie or header
func getToken(c *fiber.Ctx) string {
	token := c.Cookies("yahoo-auth")
	if token == "" {
		authHeader := c.Get("Authorization")
		if len(authHeader) > 7 && strings.EqualFold(authHeader[:7], "Bearer ") {
			token = authHeader[7:]
		}
	}
	return token
}

// Helper to fetch from Yahoo with auto-refresh
func fetchYahoo(c *fiber.Ctx, url string) ([]byte, error) {
	token := getToken(c)
	if token == "" {
		return nil, fmt.Errorf("unauthorized")
	}

	client := &http.Client{}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		refreshToken := c.Cookies("yahoo-refresh")
		if refreshToken == "" {
			return nil, fmt.Errorf("unauthorized")
		}

		ctx := context.Background()
		t := &oauth2.Token{
			RefreshToken: refreshToken,
		}
		newToken, err := yahooConfig.TokenSource(ctx, t).Token()
		if err != nil {
			return nil, fmt.Errorf("refresh failed")
		}

		c.Cookie(&fiber.Cookie{
			Name:     "yahoo-auth",
			Value:    newToken.AccessToken,
			Expires:  time.Now().Add(24 * time.Hour),
			HTTPOnly: true,
			Secure:   true,
			SameSite: "Lax",
			Path:     "/",
		})

		req.Header.Set("Authorization", "Bearer "+newToken.AccessToken)
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
	}

	return io.ReadAll(resp.Body)
}

// YahooStart godoc
// @Summary Start Yahoo OAuth2 flow.
// @Description Redirects the user to Yahoo for authentication.
// @Tags Yahoo OAuth
// @Success 307
// @Failure 500 {object} ErrorResponse
// @Router /yahoo/start [get]
func YahooStart(c *fiber.Ctx) error {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)

	err := rdb.Set(context.Background(), "csrf:"+state, "1", 10*time.Minute).Err()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to store state"})
	}

	url := yahooConfig.AuthCodeURL(state)
	return c.Redirect(url, fiber.StatusTemporaryRedirect)
}

// YahooCallback godoc
// @Summary Handle Yahoo OAuth2 callback.
// @Description Validates state and exchanges code for tokens. Sets secure cookies and returns postMessage script.
// @Tags Yahoo OAuth
// @Param code query string true "Auth Code"
// @Param state query string true "CSRF State"
// @Success 200 {string} string "HTML bridge script"
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /yahoo/callback [get]
func YahooCallback(c *fiber.Ctx) error {
	state := c.Query("state")
	code := c.Query("code")

	val, err := rdb.GetDel(context.Background(), "csrf:"+state).Result()
	if err != nil || val == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Invalid or expired state"})
	}

	token, err := yahooConfig.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to exchange code"})
	}

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

// YahooLeagues godoc
// @Summary Get Yahoo user leagues.
// @Description Fetches and parses the authenticated user's leagues from Yahoo. Supports NFL, NBA, and NHL.
// @Tags Yahoo Data
// @Produce json
// @Success 200 {object} FantasyContent
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /yahoo/leagues [get]
func YahooLeagues(c *fiber.Ctx) error {
	body, err := fetchYahoo(c, "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl,nba,nhl/leagues")
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: err.Error()})
	}
	
	var content FantasyContent
	if err := xml.Unmarshal(body, &content); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to parse Yahoo data"})
	}

	return c.JSON(content)
}

// YahooStandings godoc
// @Summary Get Yahoo league standings.
// @Description Fetches and parses full leaderboard standings for a specific league.
// @Tags Yahoo Data
// @Param league_key path string true "League Key (e.g. 461.l.281810)"
// @Produce json
// @Success 200 {object} FantasyContent
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /yahoo/league/{league_key}/standings [get]
func YahooStandings(c *fiber.Ctx) error {
	leagueKey := c.Params("league_key")
	body, err := fetchYahoo(c, fmt.Sprintf("https://fantasysports.yahooapis.com/fantasy/v2/league/%s/standings", leagueKey))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: err.Error()})
	}

	var content FantasyContent
	if err := xml.Unmarshal(body, &content); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to parse Yahoo data"})
	}

	return c.JSON(content)
}

// YahooMatchups godoc
// @Summary Get Yahoo team matchups.
// @Description Fetches and parses all matchups (past and future) for a specific team.
// @Tags Yahoo Data
// @Param team_key path string true "Team Key (e.g. 461.l.281810.t.1)"
// @Produce json
// @Success 200 {object} FantasyContent
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /yahoo/team/{team_key}/matchups [get]
func YahooMatchups(c *fiber.Ctx) error {
	teamKey := c.Params("team_key")
	body, err := fetchYahoo(c, fmt.Sprintf("https://fantasysports.yahooapis.com/fantasy/v2/team/%s/matchups", teamKey))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: err.Error()})
	}

	var content FantasyContent
	if err := xml.Unmarshal(body, &content); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to parse Yahoo data"})
	}

	return c.JSON(content)
}

// YahooRoster godoc
// @Summary Get Yahoo team roster.
// @Description Fetches and parses the current roster, positions, and basic stats for a team.
// @Tags Yahoo Data
// @Param team_key path string true "Team Key (e.g. 461.l.281810.t.1)"
// @Produce json
// @Success 200 {object} FantasyContent
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /yahoo/team/{team_key}/roster [get]
func YahooRoster(c *fiber.Ctx) error {
	teamKey := c.Params("team_key")
	body, err := fetchYahoo(c, fmt.Sprintf("https://fantasysports.yahooapis.com/fantasy/v2/team/%s/roster", teamKey))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: err.Error()})
	}

	var content FantasyContent
	if err := xml.Unmarshal(body, &content); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to parse Yahoo data"})
	}

	return c.JSON(content)
}
