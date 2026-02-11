package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
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
)

// =============================================================================
// Yahoo OAuth Flow
// =============================================================================

// YahooStart initiates the Yahoo OAuth flow.
func (a *App) YahooStart(c *fiber.Ctx) error {
	// Extract logto_sub from query parameter (passed by frontend) or X-User-Sub header
	logtoSub := c.Query("logto_sub")
	if logtoSub == "" {
		logtoSub = GetUserSub(c)
	}
	if logtoSub == "" {
		logtoSub = c.Cookies("logto_sub")
	}

	b := make([]byte, OAuthStateBytes)
	rand.Read(b)
	state := hex.EncodeToString(b)

	// Store state and logto_sub mapping
	pipe := a.rdb.Pipeline()
	pipe.Set(context.Background(), RedisCSRFPrefix+state, "1", OAuthStateExpiry)
	if logtoSub != "" {
		pipe.Set(context.Background(), RedisYahooStateLogtoPrefix+state, logtoSub, OAuthStateExpiry)
	}
	_, err := pipe.Exec(context.Background())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to store state"})
	}
	return c.Redirect(a.yahooConfig.AuthCodeURL(state), fiber.StatusTemporaryRedirect)
}

// YahooCallback handles the Yahoo OAuth callback.
func (a *App) YahooCallback(c *fiber.Ctx) error {
	state, code := c.Query("state"), c.Query("code")
	val, err := a.rdb.GetDel(context.Background(), RedisCSRFPrefix+state).Result()
	if err != nil || val == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Invalid or expired state"})
	}

	// Retrieve logto_sub associated with this state
	logtoSub, err := a.rdb.Get(context.Background(), RedisYahooStateLogtoPrefix+state).Result()
	if err != nil {
		log.Printf("[Yahoo Callback] Warning: Failed to retrieve logto_sub from Redis for state %s: %v", state, err)
	}

	token, err := a.yahooConfig.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to exchange code"})
	}

	c.Cookie(&fiber.Cookie{
		Name: "yahoo-auth", Value: token.AccessToken,
		Expires: time.Now().Add(YahooAuthCookieExpiry),
		HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/",
	})

	if token.RefreshToken != "" {
		c.Cookie(&fiber.Cookie{
			Name: "yahoo-refresh", Value: token.RefreshToken,
			Expires: time.Now().Add(YahooRefreshCookieExpiry),
			HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/",
		})

		// Fetch GUID and persist for Active Sync
		go func(accessToken, refreshToken string, sub string) {
			client := &http.Client{Timeout: YahooAPITimeout}
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
						// Use the passed sub if available, otherwise use guid
						logtoIdentifier := sub
						if logtoIdentifier == "" {
							logtoIdentifier = guid // Fallback to Yahoo GUID
						}
						a.UpsertYahooUser(guid, logtoIdentifier, refreshToken)
						log.Printf("[Yahoo Sync] Registered user %s (Logto: %s) for active sync", guid, logtoIdentifier)

						// Hash token for Redis key
						h := sha256.Sum256([]byte(accessToken))
						tokenHash := hex.EncodeToString(h[:])

						a.rdb.Set(context.Background(), RedisTokenToGuidPrefix+tokenHash, guid, TokenToGuidTTL)
					}
				}
			}
		}(token.AccessToken, token.RefreshToken, logtoSub)
	}

	frontendURL := ValidateURL(os.Getenv("FRONTEND_URL"), DefaultFrontendURL)
	if os.Getenv("FRONTEND_URL") == "" {
		log.Printf("[Security Warning] FRONTEND_URL not set, defaulting to %s for postMessage", DefaultFrontendURL)
	}

	html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Complete</title></head>
            <body style="font-family: ui-sans-serif, system-ui;"><script>(function() { try { if (window.opener) { window.opener.postMessage({ type: 'yahoo-auth-complete' }, '%s'); } } catch(e) { } setTimeout(function(){ window.close(); }, %d); })();</script>
            <p>Authentication successful. You can close this window.</p></body></html>`, frontendURL, AuthPopupCloseDelayMs)
	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(html)
}

// =============================================================================
// User Management Routes
// =============================================================================

// GetYahooStatus returns whether the current user has Yahoo connected.
func (a *App) GetYahooStatus(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var lastSync sql.NullTime
	err := a.db.QueryRow(context.Background(), `
		SELECT last_sync FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&lastSync)

	if err != nil {
		errStr := err.Error()
		if err == sql.ErrNoRows || strings.Contains(errStr, "no rows") {
			return c.JSON(YahooStatusResponse{Connected: false, Synced: false})
		}
		log.Printf("[GetYahooStatus] Error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to check Yahoo status",
		})
	}

	return c.JSON(YahooStatusResponse{
		Connected: true,
		Synced:    lastSync.Valid,
	})
}

// GetMyYahooLeagues returns all yahoo leagues + standings for the authenticated user.
func (a *App) GetMyYahooLeagues(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Get user's GUID from logto_sub
	var guid string
	err := a.db.QueryRow(context.Background(), `
		SELECT guid FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"leagues": []any{}, "standings": map[string]any{}})
	}

	// Fetch all leagues for this user
	leagueRows, err := a.db.Query(context.Background(), `
		SELECT league_key, guid, name, game_code, season, data FROM yahoo_leagues WHERE guid = $1
	`, guid)
	if err != nil {
		log.Printf("[GetMyYahooLeagues] League query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to fetch leagues"})
	}
	defer leagueRows.Close()

	leagues := make([]fiber.Map, 0)
	leagueKeys := make([]string, 0)
	for leagueRows.Next() {
		var lk, g, name, gameCode, season string
		var data json.RawMessage
		if err := leagueRows.Scan(&lk, &g, &name, &gameCode, &season, &data); err != nil {
			continue
		}
		leagues = append(leagues, fiber.Map{
			"league_key": lk,
			"guid":       g,
			"name":       name,
			"game_code":  gameCode,
			"season":     season,
			"data":       json.RawMessage(data),
		})
		leagueKeys = append(leagueKeys, lk)
	}

	// Fetch standings for all leagues
	standings := make(map[string]json.RawMessage)
	if len(leagueKeys) > 0 {
		standingsRows, err := a.db.Query(context.Background(), `
			SELECT league_key, data FROM yahoo_standings WHERE league_key = ANY($1)
		`, leagueKeys)
		if err == nil {
			defer standingsRows.Close()
			for standingsRows.Next() {
				var lk string
				var data json.RawMessage
				if err := standingsRows.Scan(&lk, &data); err == nil {
					standings[lk] = data
				}
			}
		}
	}

	return c.JSON(fiber.Map{
		"leagues":   leagues,
		"standings": standings,
	})
}

// DisconnectYahoo removes the user's Yahoo connection and all associated data.
func (a *App) DisconnectYahoo(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Look up the user's Yahoo GUID before deleting
	var guid string
	err := a.db.QueryRow(context.Background(), `
		SELECT guid FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"status": "ok", "message": "No Yahoo account connected"})
	}

	// Delete from yahoo_users — cascades to yahoo_leagues, yahoo_standings, yahoo_rosters
	_, err = a.db.Exec(context.Background(), `
		DELETE FROM yahoo_users WHERE logto_sub = $1
	`, userID)
	if err != nil {
		log.Printf("[DisconnectYahoo] Error deleting yahoo_users: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to disconnect Yahoo account",
		})
	}

	// Clear Redis cache keys for this user
	cacheKeys := []string{
		CacheKeyYahooLeaguesPrefix + guid,
	}
	for _, key := range cacheKeys {
		a.rdb.Del(context.Background(), key)
	}

	// Clear any token_to_guid mappings (scan for matching GUID values)
	iter := a.rdb.Scan(context.Background(), 0, RedisTokenToGuidPrefix+"*", RedisScanCount).Iterator()
	for iter.Next(context.Background()) {
		val, err := a.rdb.Get(context.Background(), iter.Val()).Result()
		if err == nil && val == guid {
			a.rdb.Del(context.Background(), iter.Val())
		}
	}

	log.Printf("[DisconnectYahoo] User %s disconnected Yahoo (GUID: %s)", userID, guid)
	return c.JSON(fiber.Map{"status": "ok", "message": "Yahoo account disconnected"})
}
