package fantasy

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

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/gofiber/fiber/v2"
)

// YahooStart initiates the Yahoo OAuth flow.
// @Summary Start Yahoo OAuth
// @Description Redirects user to Yahoo login page
// @Tags Yahoo
// @Success 307
// @Router /yahoo/start [get]
func (f *Integration) YahooStart(c *fiber.Ctx) error {
	// Extract logto_sub from query parameter (passed by frontend) or cookies
	logtoSub := c.Query("logto_sub")
	if logtoSub == "" {
		logtoSub = c.Cookies("logto_sub")
	}

	b := make([]byte, core.OAuthStateBytes)
	rand.Read(b)
	state := hex.EncodeToString(b)

	// Store state and logto_sub mapping
	pipe := f.rdb.Pipeline()
	pipe.Set(context.Background(), core.RedisCSRFPrefix+state, "1", core.OAuthStateExpiry)
	if logtoSub != "" {
		pipe.Set(context.Background(), core.RedisYahooStateLogtoPrefix+state, logtoSub, core.OAuthStateExpiry)
	}
	_, err := pipe.Exec(context.Background())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Failed to store state"})
	}
	return c.Redirect(f.yahooConfig.AuthCodeURL(state), fiber.StatusTemporaryRedirect)
}

// YahooCallback handles the Yahoo OAuth callback.
// @Summary Yahoo OAuth callback
// @Description Exchanges auth code for tokens and registers user
// @Tags Yahoo
// @Param state query string true "OAuth state"
// @Param code query string true "OAuth code"
// @Success 200 {string} string "HTML response"
// @Router /yahoo/callback [get]
func (f *Integration) YahooCallback(c *fiber.Ctx) error {
	state, code := c.Query("state"), c.Query("code")
	val, err := f.rdb.GetDel(context.Background(), core.RedisCSRFPrefix+state).Result()
	if err != nil || val == "" {
		return c.Status(fiber.StatusBadRequest).JSON(core.ErrorResponse{Status: "error", Error: "Invalid or expired state"})
	}

	// Retrieve logto_sub associated with this state
	logtoSub, err := f.rdb.Get(context.Background(), core.RedisYahooStateLogtoPrefix+state).Result()
	if err != nil {
		log.Printf("[Yahoo Callback] Warning: Failed to retrieve logto_sub from Redis for state %s: %v", state, err)
	}

	token, err := f.yahooConfig.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Failed to exchange code"})
	}

	c.Cookie(&fiber.Cookie{
		Name: "yahoo-auth", Value: token.AccessToken,
		Expires: time.Now().Add(core.YahooAuthCookieExpiry),
		HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/",
	})

	if token.RefreshToken != "" {
		c.Cookie(&fiber.Cookie{
			Name: "yahoo-refresh", Value: token.RefreshToken,
			Expires: time.Now().Add(core.YahooRefreshCookieExpiry),
			HTTPOnly: true, Secure: true, SameSite: "Strict", Path: "/",
		})

		// Fetch GUID and persist for Active Sync
		go func(accessToken, refreshToken string, sub string) {
			client := &http.Client{Timeout: core.YahooAPITimeout}
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
						f.UpsertYahooUser(guid, logtoIdentifier, refreshToken)
						log.Printf("[Yahoo Sync] Registered user %s (Logto: %s) for active sync", guid, logtoIdentifier)

						// Hash token for Redis key
						h := sha256.Sum256([]byte(accessToken))
						tokenHash := hex.EncodeToString(h[:])

						f.rdb.Set(context.Background(), core.RedisTokenToGuidPrefix+tokenHash, guid, core.TokenToGuidTTL)
					}
				}
			}
		}(token.AccessToken, token.RefreshToken, logtoSub)
	}

	frontendURL := core.ValidateURL(os.Getenv("FRONTEND_URL"), core.DefaultFrontendURL)
	if os.Getenv("FRONTEND_URL") == "" {
		log.Printf("[Security Warning] FRONTEND_URL not set, defaulting to %s for postMessage", core.DefaultFrontendURL)
	}

	html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Complete</title></head>
            <body style="font-family: ui-sans-serif, system-ui;"><script>(function() { try { if (window.opener) { window.opener.postMessage({ type: 'yahoo-auth-complete' }, '%s'); } } catch(e) { } setTimeout(function(){ window.close(); }, %d); })();</script>
            <p>Authentication successful. You can close this window.</p></body></html>`, frontendURL, core.AuthPopupCloseDelayMs)
	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(html)
}

// GetYahooStatus returns whether the current user has Yahoo connected.
// @Summary Get Yahoo connection status
// @Description Check if user has Yahoo Fantasy linked
// @Tags Yahoo
// @Produce json
// @Success 200 {object} YahooStatusResponse
// @Security LogtoAuth
// @Router /users/me/yahoo-status [get]
func (f *Integration) GetYahooStatus(c *fiber.Ctx) error {
	userID := core.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(core.ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var lastSync sql.NullTime
	err := f.db.QueryRow(context.Background(), `
		SELECT last_sync FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&lastSync)

	if err != nil {
		errStr := err.Error()
		if err == sql.ErrNoRows || strings.Contains(errStr, "no rows") {
			return c.JSON(YahooStatusResponse{Connected: false, Synced: false})
		}
		log.Printf("[GetYahooStatus] Error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{
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
// @Summary Get my Yahoo leagues
// @Description Fetch leagues and standings for the current user
// @Tags Yahoo
// @Produce json
// @Success 200 {object} object
// @Security LogtoAuth
// @Router /users/me/yahoo-leagues [get]
func (f *Integration) GetMyYahooLeagues(c *fiber.Ctx) error {
	userID := core.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(core.ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Get user's GUID from logto_sub
	var guid string
	err := f.db.QueryRow(context.Background(), `
		SELECT guid FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"leagues": []any{}, "standings": map[string]any{}})
	}

	// Fetch all leagues for this user
	leagueRows, err := f.db.Query(context.Background(), `
		SELECT league_key, guid, name, game_code, season, data FROM yahoo_leagues WHERE guid = $1
	`, guid)
	if err != nil {
		log.Printf("[GetMyYahooLeagues] League query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{Status: "error", Error: "Failed to fetch leagues"})
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
		standingsRows, err := f.db.Query(context.Background(), `
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
// @Summary Disconnect Yahoo
// @Description Remove Yahoo Fantasy connection and all associated data
// @Tags Yahoo
// @Produce json
// @Success 200 {object} object{status=string,message=string}
// @Security LogtoAuth
// @Router /users/me/yahoo [delete]
func (f *Integration) DisconnectYahoo(c *fiber.Ctx) error {
	userID := core.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(core.ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Look up the user's Yahoo GUID before deleting
	var guid string
	err := f.db.QueryRow(context.Background(), `
		SELECT guid FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"status": "ok", "message": "No Yahoo account connected"})
	}

	// Delete from yahoo_users — cascades to yahoo_leagues, yahoo_standings, yahoo_rosters
	_, err = f.db.Exec(context.Background(), `
		DELETE FROM yahoo_users WHERE logto_sub = $1
	`, userID)
	if err != nil {
		log.Printf("[DisconnectYahoo] Error deleting yahoo_users: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{
			Status: "error",
			Error:  "Failed to disconnect Yahoo account",
		})
	}

	// Clear Redis cache keys for this user
	cacheKeys := []string{
		core.CacheKeyYahooLeaguesPrefix + guid,
	}
	for _, key := range cacheKeys {
		f.rdb.Del(context.Background(), key)
	}

	// Clear any token_to_guid mappings (scan for matching GUID values)
	iter := f.rdb.Scan(context.Background(), 0, core.RedisTokenToGuidPrefix+"*", core.RedisScanCount).Iterator()
	for iter.Next(context.Background()) {
		val, err := f.rdb.Get(context.Background(), iter.Val()).Result()
		if err == nil && val == guid {
			f.rdb.Del(context.Background(), iter.Val())
		}
	}

	log.Printf("[DisconnectYahoo] User %s disconnected Yahoo (GUID: %s)", userID, guid)
	return c.JSON(fiber.Map{"status": "ok", "message": "Yahoo account disconnected"})
}
