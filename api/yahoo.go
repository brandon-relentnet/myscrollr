package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
	if domain == "" { domain = os.Getenv("COOLIFY_FQDN") }
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")
	callbackPath := os.Getenv("YAHOO_CALLBACK_URL")
	if callbackPath == "" { callbackPath = "/yahoo/callback" }
	if !strings.HasPrefix(callbackPath, "/") { callbackPath = "/" + callbackPath }
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

func getGuid(c *fiber.Ctx) string {
	token := getToken(c)
	if token == "" { return "" }
	
	h := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(h[:])
	
	guid, _ := rdb.Get(context.Background(), "token_to_guid:"+tokenHash).Result()
	return guid
}

func fetchYahoo(c *fiber.Ctx, url string) ([]byte, error) {
	token := getToken(c)
	if token == "" { return nil, fmt.Errorf("unauthorized") }

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil { return nil, err }
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		refreshToken := c.Cookies("yahoo-refresh")
		if refreshToken == "" { return nil, fmt.Errorf("unauthorized") }
		ctx := context.Background()
		t := &oauth2.Token{RefreshToken: refreshToken}
		newToken, err := yahooConfig.TokenSource(ctx, t).Token()
		if err != nil { return nil, fmt.Errorf("refresh failed") }

		c.Cookie(&fiber.Cookie{
			Name: "yahoo-auth", Value: newToken.AccessToken, Expires: time.Now().Add(24 * time.Hour), HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/",
		})

		req.Header.Set("Authorization", "Bearer "+newToken.AccessToken)
		resp, err = client.Do(req)
		if err != nil { return nil, err }
		defer resp.Body.Close()
	}

	return io.ReadAll(resp.Body)
}

// YahooStart initiates the Yahoo OAuth flow
// @Summary Start Yahoo OAuth
// @Description Redirects user to Yahoo login page
// @Tags Yahoo
// @Success 307
// @Security LogtoAuth
// @Router /yahoo/start [get]
func YahooStart(c *fiber.Ctx) error {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)
	err := rdb.Set(context.Background(), "csrf:"+state, "1", 10*time.Minute).Err()
	if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to store state"}) }
	return c.Redirect(yahooConfig.AuthCodeURL(state), fiber.StatusTemporaryRedirect)
}

// YahooCallback handles the Yahoo OAuth callback
// @Summary Yahoo OAuth callback
// @Description Exchanges auth code for tokens and registers user
// @Tags Yahoo
// @Param state query string true "OAuth state"
// @Param code query string true "OAuth code"
// @Success 200 {string} string "HTML response"
// @Router /yahoo/callback [get]
func YahooCallback(c *fiber.Ctx) error {
	state, code := c.Query("state"), c.Query("code")
	val, err := rdb.GetDel(context.Background(), "csrf:"+state).Result()
	if err != nil || val == "" { return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Invalid or expired state"}) }
	token, err := yahooConfig.Exchange(context.Background(), code)
	if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to exchange code"}) }

	c.Cookie(&fiber.Cookie{Name: "yahoo-auth", Value: token.AccessToken, Expires: time.Now().Add(24 * time.Hour), HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/"})
	if token.RefreshToken != "" {
		c.Cookie(&fiber.Cookie{Name: "yahoo-refresh", Value: token.RefreshToken, Expires: time.Now().Add(30 * 24 * time.Hour), HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/"})
		
		// Fetch GUID and persist for Active Sync
		go func(accessToken, refreshToken string) {
			client := &http.Client{Timeout: 10 * time.Second}
			req, _ := http.NewRequest("GET", "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1", nil)
			req.Header.Set("Authorization", "Bearer "+accessToken)
			resp, err := client.Do(req)
			if err == nil {
				defer resp.Body.Close()
				body, _ := io.ReadAll(resp.Body)
				var content FantasyContent
				if err := xml.Unmarshal(body, &content); err == nil && content.Users != nil && len(content.Users.User) > 0 {
					guid := content.Users.User[0].Guid
					if guid != "" {
						UpsertYahooUser(guid, refreshToken)
						log.Printf("[Yahoo Sync] Registered user %s for active sync", guid)
						
						// Hash token for Redis key
						h := sha256.Sum256([]byte(accessToken))
						tokenHash := hex.EncodeToString(h[:])
						
						rdb.Set(context.Background(), "token_to_guid:"+tokenHash, guid, 24*time.Hour)
					}
				}
			}
		}(token.AccessToken, token.RefreshToken)
	}

	frontendURL := validateURL(os.Getenv("FRONTEND_URL"), "https://myscrollr.com")
	if os.Getenv("FRONTEND_URL") == "" {
		log.Println("[Security Warning] FRONTEND_URL not set, defaulting to https://myscrollr.com for postMessage")
	}

	html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Complete</title></head>
            <body style="font-family: ui-sans-serif, system-ui;"><script>(function() { try { if (window.opener) { window.opener.postMessage({ type: 'yahoo-auth-complete' }, '%s'); } } catch(e) { } setTimeout(function(){ window.close(); }, 1500); })();</script>
            <p>Authentication successful. You can close this window.</p></body></html>`, frontendURL)
	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(html)
}

// YahooLeagues retrieves the authenticated user's leagues
// @Summary Get user leagues
// @Description Fetches user's fantasy leagues with 5m caching. Uses Active Sync data if available.
// @Tags Yahoo
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/leagues [get]
func YahooLeagues(c *fiber.Ctx) error {
	guid := getGuid(c)
	cacheKey := "cache:yahoo:leagues:" + guid
	if guid == "" {
		token := getToken(c)
		if token != "" { cacheKey = "cache:yahoo:leagues:" + token[:10] }
	}

	var content FantasyContent
	if GetCache(cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	// Try Database (Active Sync)
	if guid != "" {
		var data []byte
		err := dbPool.QueryRow(context.Background(), "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
		if err == nil {
			if err := json.Unmarshal(data, &content); err == nil {
				SetCache(cacheKey, content, 5*time.Minute)
				c.Set("X-Cache", "DB-HIT")
				return c.JSON(content)
			}
		}
	}

	// Fallback to Live API
	body, err := fetchYahoo(c, "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl,nba,nhl/leagues")
	if err != nil { 
		log.Printf("[Yahoo Error] Fetch failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Failed to fetch data from Yahoo"}) 
	}
	if err := xml.Unmarshal(body, &content); err != nil { 
		log.Printf("[Yahoo Error] Unmarshal failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to process Yahoo data"}) 
	}

	SetCache(cacheKey, content, 5*time.Minute)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// YahooStandings retrieves standings for a league
// @Summary Get league standings
// @Description Fetches standings for a specific league key
// @Tags Yahoo
// @Param league_key path string true "League Key"
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/league/{league_key}/standings [get]
func YahooStandings(c *fiber.Ctx) error {
	leagueKey := c.Params("league_key")
	cacheKey := "cache:yahoo:standings:" + leagueKey
	var content FantasyContent
	if GetCache(cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	body, err := fetchYahoo(c, fmt.Sprintf("https://fantasysports.yahooapis.com/fantasy/v2/league/%s/standings", leagueKey))
	if err != nil { 
		log.Printf("[Yahoo Error] Fetch standings failed for %s: %v", leagueKey, err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Failed to fetch standings"}) 
	}
	if err := xml.Unmarshal(body, &content); err != nil { 
		log.Printf("[Yahoo Error] Unmarshal standings failed for %s: %v", leagueKey, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to process standings data"}) 
	}

	SetCache(cacheKey, content, 5*time.Minute)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// YahooMatchups retrieves matchups for a team
// @Summary Get team matchups
// @Description Fetches matchups for a specific team key
// @Tags Yahoo
// @Param team_key path string true "Team Key"
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/team/{team_key}/matchups [get]
func YahooMatchups(c *fiber.Ctx) error {
	teamKey := c.Params("team_key")
	cacheKey := "cache:yahoo:matchups:" + teamKey
	var content FantasyContent
	if GetCache(cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	body, err := fetchYahoo(c, fmt.Sprintf("https://fantasysports.yahooapis.com/fantasy/v2/team/%s/matchups", teamKey))
	if err != nil { 
		log.Printf("[Yahoo Error] Fetch matchups failed for %s: %v", teamKey, err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Failed to fetch matchups"}) 
	}
	if err := xml.Unmarshal(body, &content); err != nil { 
		log.Printf("[Yahoo Error] Unmarshal matchups failed for %s: %v", teamKey, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to process matchups data"}) 
	}

	SetCache(cacheKey, content, 5*time.Minute)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// YahooRoster retrieves roster for a team
// @Summary Get team roster
// @Description Fetches roster for a specific team key
// @Tags Yahoo
// @Param team_key path string true "Team Key"
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/team/{team_key}/roster [get]
func YahooRoster(c *fiber.Ctx) error {
	teamKey := c.Params("team_key")
	cacheKey := "cache:yahoo:roster:" + teamKey
	var content FantasyContent
	if GetCache(cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	body, err := fetchYahoo(c, fmt.Sprintf("https://fantasysports.yahooapis.com/fantasy/v2/team/%s/roster", teamKey))
	if err != nil { 
		log.Printf("[Yahoo Error] Fetch roster failed for %s: %v", teamKey, err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Failed to fetch roster"}) 
	}
	if err := xml.Unmarshal(body, &content); err != nil { 
		log.Printf("[Yahoo Error] Unmarshal roster failed for %s: %v", teamKey, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to process roster data"}) 
	}

	SetCache(cacheKey, content, 5*time.Minute)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}