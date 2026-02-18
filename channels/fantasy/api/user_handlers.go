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
	log.Printf("[YahooStart] Hit — query logto_sub=%q, X-User-Sub=%q, cookie logto_sub=%q",
		c.Query("logto_sub"), GetUserSub(c), c.Cookies("logto_sub"))

	// Extract logto_sub from query parameter (passed by frontend) or X-User-Sub header
	logtoSub := c.Query("logto_sub")
	if logtoSub == "" {
		logtoSub = GetUserSub(c)
	}
	if logtoSub == "" {
		logtoSub = c.Cookies("logto_sub")
	}

	if logtoSub == "" {
		log.Println("[YahooStart] Warning: no logto_sub resolved from any source")
	} else {
		log.Printf("[YahooStart] Resolved logto_sub=%s", logtoSub)
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
		log.Printf("[YahooStart] Redis pipeline failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to store state"})
	}

	authURL := a.yahooConfig.AuthCodeURL(state)
	log.Printf("[YahooStart] Redirecting to Yahoo OAuth (state=%s…) redirect_uri=%s", state[:8], a.yahooConfig.RedirectURL)
	return c.Redirect(authURL, fiber.StatusTemporaryRedirect)
}

// YahooCallback handles the Yahoo OAuth callback.
func (a *App) YahooCallback(c *fiber.Ctx) error {
	state, code := c.Query("state"), c.Query("code")
	log.Printf("[YahooCallback] Hit — state=%q code_present=%v", state, code != "")

	if state == "" || code == "" {
		log.Printf("[YahooCallback] Missing state or code — state=%q code=%q", state, code)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Missing state or code"})
	}

	val, err := a.rdb.GetDel(context.Background(), RedisCSRFPrefix+state).Result()
	if err != nil || val == "" {
		log.Printf("[YahooCallback] CSRF validation failed — state=%s err=%v val=%q", state, err, val)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "Invalid or expired state"})
	}
	log.Printf("[YahooCallback] CSRF validated for state=%s…", state[:8])

	// Retrieve logto_sub associated with this state
	logtoSub, err := a.rdb.Get(context.Background(), RedisYahooStateLogtoPrefix+state).Result()
	if err != nil {
		log.Printf("[YahooCallback] Warning: Failed to retrieve logto_sub from Redis for state %s: %v", state, err)
	} else {
		log.Printf("[YahooCallback] Retrieved logto_sub=%s for state=%s…", logtoSub, state[:8])
	}

	log.Printf("[YahooCallback] Exchanging code for token (redirect_uri=%s)…", a.yahooConfig.RedirectURL)
	token, err := a.yahooConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("[YahooCallback] Token exchange failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to exchange code"})
	}
	log.Printf("[YahooCallback] Token exchange succeeded — access_token_len=%d refresh_token_present=%v expires=%v",
		len(token.AccessToken), token.RefreshToken != "", token.Expiry)

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

		// Fetch GUID and persist for Active Sync — synchronous so we can
		// return an error page if linking fails (instead of silently swallowing).
		log.Printf("[YahooCallback] Linking Yahoo account (logto_sub=%s)…", logtoSub)
		linkErr := a.fetchAndLinkYahooUser(token.AccessToken, token.RefreshToken, logtoSub)
		if linkErr != nil {
			log.Printf("[YahooCallback] Failed to link Yahoo account: %v", linkErr)
			// Still show the user a meaningful error instead of a false success
			html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Error</title></head>
				<body style="font-family: ui-sans-serif, system-ui;">
				<p>Yahoo authentication succeeded, but we failed to link your account. Please try again.</p>
				<script>setTimeout(function(){ window.close(); }, %d);</script>
				</body></html>`, AuthPopupCloseDelayMs)
			c.Set("Content-Type", "text/html")
			return c.Status(fiber.StatusInternalServerError).SendString(html)
		}
		log.Printf("[YahooCallback] Yahoo account linked successfully")
	} else {
		log.Println("[YahooCallback] Warning: No refresh token received from Yahoo")
	}

	frontendURL := ValidateURL(os.Getenv("FRONTEND_URL"), DefaultFrontendURL)
	if os.Getenv("FRONTEND_URL") == "" {
		log.Printf("[Security Warning] FRONTEND_URL not set, defaulting to %s for postMessage", DefaultFrontendURL)
	}

	log.Printf("[YahooCallback] Auth complete — sending postMessage to %s and closing popup", frontendURL)
	html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Complete</title></head>
            <body style="font-family: ui-sans-serif, system-ui;"><script>(function() { try { if (window.opener) { window.opener.postMessage({ type: 'yahoo-auth-complete' }, '%s'); } } catch(e) { } setTimeout(function(){ window.close(); }, %d); })();</script>
            <p>Authentication successful. You can close this window.</p></body></html>`, frontendURL, AuthPopupCloseDelayMs)
	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(html)
}

// =============================================================================
// Yahoo Account Linking
// =============================================================================

// fetchAndLinkYahooUser fetches the Yahoo GUID for the given access token,
// upserts the yahoo_users row, and caches the token→GUID mapping in Redis.
// Returns an error if any step fails (instead of silently swallowing).
func (a *App) fetchAndLinkYahooUser(accessToken, refreshToken, logtoSub string) error {
	log.Printf("[fetchAndLinkYahooUser] Starting — logto_sub=%s access_token_len=%d", logtoSub, len(accessToken))

	client := &http.Client{Timeout: YahooAPITimeout}
	req, err := http.NewRequest("GET", "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1", nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch Yahoo user: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("[fetchAndLinkYahooUser] Yahoo API responded with status=%d", resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[fetchAndLinkYahooUser] Yahoo API error — status=%d body=%s", resp.StatusCode, string(body))
		return fmt.Errorf("Yahoo API returned status %d", resp.StatusCode)
	}

	var content FantasyContent
	if err := xml.Unmarshal(body, &content); err != nil {
		log.Printf("[fetchAndLinkYahooUser] XML unmarshal failed — body_len=%d body_preview=%.200s", len(body), string(body))
		return fmt.Errorf("unmarshal Yahoo response: %w", err)
	}

	if content.Users == nil || len(content.Users.User) == 0 {
		log.Printf("[fetchAndLinkYahooUser] No users in response — body_preview=%.300s", string(body))
		return fmt.Errorf("no Yahoo user found in response")
	}

	guid := content.Users.User[0].Guid
	if guid == "" {
		return fmt.Errorf("empty GUID in Yahoo response")
	}

	// Use the logto_sub if available, otherwise fall back to Yahoo GUID
	logtoIdentifier := logtoSub
	if logtoIdentifier == "" {
		log.Printf("[fetchAndLinkYahooUser] No logto_sub, falling back to GUID=%s as identifier", guid)
		logtoIdentifier = guid
	}

	log.Printf("[fetchAndLinkYahooUser] Upserting user — guid=%s logto_sub=%s", guid, logtoIdentifier)
	if err := a.UpsertYahooUser(guid, logtoIdentifier, refreshToken); err != nil {
		return fmt.Errorf("upsert Yahoo user: %w", err)
	}

	log.Printf("[Yahoo Sync] Registered user %s (Logto: %s) for active sync", guid, logtoIdentifier)

	// Cache token→GUID mapping in Redis
	h := sha256.Sum256([]byte(accessToken))
	tokenHash := hex.EncodeToString(h[:])
	a.rdb.Set(context.Background(), RedisTokenToGuidPrefix+tokenHash, guid, TokenToGuidTTL)

	return nil
}

// =============================================================================
// User Management Routes
// =============================================================================

// GetYahooStatus returns whether the current user has Yahoo connected.
func (a *App) GetYahooStatus(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	log.Printf("[GetYahooStatus] Hit — X-User-Sub=%q", userID)
	if userID == "" {
		log.Println("[GetYahooStatus] No X-User-Sub header — returning 401")
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
			log.Printf("[GetYahooStatus] No yahoo_users row for logto_sub=%s — not connected", userID)
			return c.JSON(YahooStatusResponse{Connected: false, Synced: false})
		}
		log.Printf("[GetYahooStatus] DB error for logto_sub=%s: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to check Yahoo status",
		})
	}

	log.Printf("[GetYahooStatus] logto_sub=%s connected=true synced=%v", userID, lastSync.Valid)
	return c.JSON(YahooStatusResponse{
		Connected: true,
		Synced:    lastSync.Valid,
	})
}

// GetMyYahooLeagues returns all yahoo leagues + standings for the authenticated user.
func (a *App) GetMyYahooLeagues(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	log.Printf("[GetMyYahooLeagues] Hit — X-User-Sub=%q", userID)
	if userID == "" {
		log.Println("[GetMyYahooLeagues] No X-User-Sub header — returning 401")
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
		log.Printf("[GetMyYahooLeagues] No GUID found for logto_sub=%s: %v — returning empty", userID, err)
		return c.JSON(fiber.Map{"leagues": []any{}, "standings": map[string]any{}})
	}
	log.Printf("[GetMyYahooLeagues] Resolved logto_sub=%s -> guid=%s", userID, guid)

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
