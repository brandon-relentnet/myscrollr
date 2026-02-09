package fantasy

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

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/oauth2"
)

// getToken reads the Yahoo access token from the cookie or Authorization header.
func (f *Integration) getToken(c *fiber.Ctx) string {
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
func (f *Integration) getGuid(c *fiber.Ctx) string {
	token := f.getToken(c)
	if token == "" {
		return ""
	}

	h := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(h[:])

	guid, _ := f.rdb.Get(context.Background(), core.RedisTokenToGuidPrefix+tokenHash).Result()
	return guid
}

// fetchYahoo makes an authenticated request to the Yahoo Fantasy API.
// Automatically refreshes the token on 401 responses.
func (f *Integration) fetchYahoo(c *fiber.Ctx, url string) ([]byte, error) {
	token := f.getToken(c)
	if token == "" {
		return nil, fmt.Errorf("unauthorized")
	}

	client := &http.Client{Timeout: core.YahooAPITimeout}
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
		newToken, err := f.yahooConfig.TokenSource(ctx, t).Token()
		if err != nil {
			return nil, fmt.Errorf("refresh failed")
		}

		c.Cookie(&fiber.Cookie{
			Name: "yahoo-auth", Value: newToken.AccessToken,
			Expires: time.Now().Add(core.YahooAuthCookieExpiry),
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
func (f *Integration) fetchYahooWithCache(c *fiber.Ctx, paramName, cachePrefix, urlTemplate, logNoun string) error {
	key := c.Params(paramName)
	cacheKey := cachePrefix + key
	var content FantasyContent
	if core.GetCache(cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	body, err := f.fetchYahoo(c, fmt.Sprintf(urlTemplate, key))
	if err != nil {
		log.Printf("[Yahoo Error] Fetch %s failed for %s: %v", logNoun, key, err)
		return c.Status(fiber.StatusUnauthorized).JSON(core.ErrorResponse{Status: "unauthorized", Error: "Failed to fetch " + logNoun})
	}
	if err := xml.Unmarshal(body, &content); err != nil {
		log.Printf("[Yahoo Error] Unmarshal %s failed for %s: %v", logNoun, key, err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Failed to process " + logNoun + " data"})
	}

	core.SetCache(cacheKey, content, core.YahooCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// YahooLeagues retrieves the authenticated user's leagues.
// @Summary Get user leagues
// @Description Fetches user's fantasy leagues with 5m caching. Uses Active Sync data if available.
// @Tags Yahoo
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/leagues [get]
func (f *Integration) YahooLeagues(c *fiber.Ctx) error {
	guid := f.getGuid(c)
	cacheKey := core.CacheKeyYahooLeaguesPrefix + guid
	if guid == "" {
		token := f.getToken(c)
		if token != "" {
			cacheKey = core.CacheKeyYahooLeaguesPrefix + token[:min(core.TokenCacheKeyPrefixLen, len(token))]
		}
	}

	var content FantasyContent
	if core.GetCache(cacheKey, &content) {
		c.Set("X-Cache", "HIT")
		return c.JSON(content)
	}

	// Try Database (Active Sync)
	if guid != "" {
		var data []byte
		err := f.db.QueryRow(context.Background(), "SELECT data FROM yahoo_leagues WHERE guid = $1 LIMIT 1", guid).Scan(&data)
		if err == nil {
			if err := json.Unmarshal(data, &content); err == nil {
				core.SetCache(cacheKey, content, core.YahooCacheTTL)
				c.Set("X-Cache", "DB-HIT")
				return c.JSON(content)
			}
		}
	}

	// Fallback to Live API
	body, err := f.fetchYahoo(c, "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl,nba,nhl,mlb/leagues")
	if err != nil {
		log.Printf("[Yahoo Error] Fetch failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(core.ErrorResponse{Status: "unauthorized", Error: "Failed to fetch data from Yahoo"})
	}
	if err := xml.Unmarshal(body, &content); err != nil {
		log.Printf("[Yahoo Error] Unmarshal failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Failed to process Yahoo data"})
	}

	core.SetCache(cacheKey, content, core.YahooCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(content)
}

// YahooStandings retrieves standings for a league.
// @Summary Get league standings
// @Description Fetches standings for a specific league key
// @Tags Yahoo
// @Param league_key path string true "League Key"
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/league/{league_key}/standings [get]
func (f *Integration) YahooStandings(c *fiber.Ctx) error {
	return f.fetchYahooWithCache(c, "league_key", core.CacheKeyYahooStandingsPrefix,
		"https://fantasysports.yahooapis.com/fantasy/v2/league/%s/standings", "standings")
}

// YahooMatchups retrieves matchups for a team.
// @Summary Get team matchups
// @Description Fetches matchups for a specific team key
// @Tags Yahoo
// @Param team_key path string true "Team Key"
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/team/{team_key}/matchups [get]
func (f *Integration) YahooMatchups(c *fiber.Ctx) error {
	return f.fetchYahooWithCache(c, "team_key", core.CacheKeyYahooMatchupsPrefix,
		"https://fantasysports.yahooapis.com/fantasy/v2/team/%s/matchups", "matchups")
}

// YahooRoster retrieves roster for a team.
// @Summary Get team roster
// @Description Fetches roster for a specific team key
// @Tags Yahoo
// @Param team_key path string true "Team Key"
// @Success 200 {object} FantasyContent
// @Security LogtoAuth
// @Router /yahoo/team/{team_key}/roster [get]
func (f *Integration) YahooRoster(c *fiber.Ctx) error {
	return f.fetchYahooWithCache(c, "team_key", core.CacheKeyYahooRosterPrefix,
		"https://fantasysports.yahooapis.com/fantasy/v2/team/%s/roster", "roster")
}
