package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/oauth2"
)

// =============================================================================
// Token Helpers
// =============================================================================

// getToken reads the Yahoo access token from the cookie or Authorization header.
func (a *App) getToken(c *fiber.Ctx) string {
	token := c.Cookies("yahoo-auth")
	if token == "" {
		authHeader := c.Get("Authorization")
		if len(authHeader) > 7 && strings.EqualFold(authHeader[:7], "Bearer ") {
			token = authHeader[7:]
		}
	}
	return token
}

// getGuid resolves a Yahoo access token to a Yahoo GUID via Redis.
func (a *App) getGuid(c *fiber.Ctx) string {
	token := a.getToken(c)
	if token == "" {
		return ""
	}

	h := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(h[:])

	guid, _ := a.rdb.Get(context.Background(), RedisTokenToGuidPrefix+tokenHash).Result()
	return guid
}

// =============================================================================
// Yahoo API Fetch Helpers
// =============================================================================

// fetchYahoo makes an authenticated request to the Yahoo Fantasy API.
// Automatically refreshes the token on 401 responses.
func (a *App) fetchYahoo(c *fiber.Ctx, url string) ([]byte, error) {
	token := a.getToken(c)
	if token == "" {
		return nil, fmt.Errorf("unauthorized")
	}

	client := &http.Client{Timeout: YahooAPITimeout}
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
		t := &oauth2.Token{RefreshToken: refreshToken}
		newToken, err := a.yahooConfig.TokenSource(ctx, t).Token()
		if err != nil {
			return nil, fmt.Errorf("refresh failed")
		}

		c.Cookie(&fiber.Cookie{
			Name: "yahoo-auth", Value: newToken.AccessToken,
			Expires: time.Now().Add(YahooAuthCookieExpiry),
			HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/",
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

// fetchYahooWithCache is a shared helper for Yahoo endpoints that follow the
// same pattern: read a route param, check cache, fetch from Yahoo API,
// unmarshal XML, cache the result.
func (a *App) fetchYahooWithCache(c *fiber.Ctx, paramName, cachePrefix, urlTemplate, logNoun string) error {
	key := c.Params(paramName)
	cacheKey := cachePrefix + key
	var content FantasyContent
	if GetCache(a.rdb, cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	body, err := a.fetchYahoo(c, fmt.Sprintf(urlTemplate, key))
	if err != nil {
		log.Printf("[Yahoo Error] Fetch %s failed for %s: %v", logNoun, key, err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Failed to fetch " + logNoun})
	}
	if err := xml.Unmarshal(body, &content); err != nil {
		log.Printf("[Yahoo Error] Unmarshal %s failed for %s: %v", logNoun, key, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to process " + logNoun + " data"})
	}

	SetCache(a.rdb, cacheKey, content, YahooCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// =============================================================================
// Public/Protected Routes (proxied by core gateway)
// =============================================================================

// YahooLeagues retrieves the authenticated user's leagues.
func (a *App) YahooLeagues(c *fiber.Ctx) error {
	guid := a.getGuid(c)
	cacheKey := CacheKeyYahooLeaguesPrefix + guid
	if guid == "" {
		token := a.getToken(c)
		if token != "" {
			cacheKey = CacheKeyYahooLeaguesPrefix + token[:min(TokenCacheKeyPrefixLen, len(token))]
		}
	}

	var content FantasyContent
	if GetCache(a.rdb, cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	// Try Database (Active Sync)
	if guid != "" {
		var data []byte
		err := a.db.QueryRow(context.Background(), "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
		if err == nil {
			if err := json.Unmarshal(data, &content); err == nil {
				SetCache(a.rdb, cacheKey, content, YahooCacheTTL)
				c.Set("X-Cache", "DB-HIT")
				return c.JSON(content)
			}
		}
	}

	// Fallback to Live API
	body, err := a.fetchYahoo(c, "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl,nba,nhl,mlb/leagues")
	if err != nil {
		log.Printf("[Yahoo Error] Fetch failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Failed to fetch data from Yahoo"})
	}
	if err := xml.Unmarshal(body, &content); err != nil {
		log.Printf("[Yahoo Error] Unmarshal failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to process Yahoo data"})
	}

	SetCache(a.rdb, cacheKey, content, YahooCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// YahooStandings retrieves standings for a league.
func (a *App) YahooStandings(c *fiber.Ctx) error {
	return a.fetchYahooWithCache(c, "league_key", CacheKeyYahooStandingsPrefix,
		"https://fantasysports.yahooapis.com/fantasy/v2/league/%s/standings", "standings")
}

// YahooMatchups retrieves matchups for a team.
func (a *App) YahooMatchups(c *fiber.Ctx) error {
	return a.fetchYahooWithCache(c, "team_key", CacheKeyYahooMatchupsPrefix,
		"https://fantasysports.yahooapis.com/fantasy/v2/team/%s/matchups", "matchups")
}

// YahooRoster retrieves roster for a team.
func (a *App) YahooRoster(c *fiber.Ctx) error {
	return a.fetchYahooWithCache(c, "team_key", CacheKeyYahooRosterPrefix,
		"https://fantasysports.yahooapis.com/fantasy/v2/team/%s/roster", "roster")
}
