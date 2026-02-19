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

	// Force Yahoo to show the login screen every time so the user can pick
	// the correct Yahoo account.  Without this, the popup reuses the browser's
	// Yahoo session and silently returns the first account's tokens.
	authURL := a.yahooConfig.AuthCodeURL(state, oauth2.SetAuthURLParam("prompt", "login"))
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

			// Show a tailored message when the Yahoo account is already
			// owned by a different Scrollr user.
			userMsg := "Yahoo authentication succeeded, but we failed to link your account. Please try again."
			if strings.Contains(linkErr.Error(), "already connected to another") {
				userMsg = "This Yahoo account is already connected to a different Scrollr account. Please sign into a different Yahoo account or disconnect it from the other Scrollr account first."
			}

			html := fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>Auth Error</title></head>
				<body style="font-family: ui-sans-serif, system-ui; max-width: 420px; margin: 2rem auto; line-height: 1.5;">
				<p>%s</p>
				<script>setTimeout(function(){ window.close(); }, %d);</script>
				</body></html>`, userMsg, AuthPopupCloseDelayMs)
			c.Set("Content-Type", "text/html")
			return c.Status(fiber.StatusConflict).SendString(html)
		}
		log.Printf("[YahooCallback] Yahoo account linked successfully")
	} else {
		log.Println("[YahooCallback] Warning: No refresh token received from Yahoo")
	}

	frontendURL := resolveFrontendURL()

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

	// Safety check: make sure this Yahoo account isn't already linked to a
	// *different* Scrollr user.  Without this guard the ON CONFLICT upsert
	// silently reassigns the Yahoo GUID to the new logto_sub, causing the
	// original owner to lose access and the new user to see the wrong data.
	var existingSub string
	checkErr := a.db.QueryRow(context.Background(),
		"SELECT logto_sub FROM yahoo_users WHERE guid = $1", guid,
	).Scan(&existingSub)
	if checkErr == nil && existingSub != logtoIdentifier {
		log.Printf("[fetchAndLinkYahooUser] BLOCKED — Yahoo GUID %s already linked to logto_sub=%s, current user is logto_sub=%s",
			guid, existingSub, logtoIdentifier)
		return fmt.Errorf("this Yahoo account is already connected to another Scrollr account")
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

	// Fetch all leagues for this user via junction table
	leagueRows, err := a.db.Query(context.Background(), `
		SELECT l.league_key, l.guid, l.name, l.game_code, l.season, l.data
		FROM yahoo_leagues l
		JOIN yahoo_user_leagues ul ON l.league_key = ul.league_key
		WHERE ul.guid = $1
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

// DiscoverYahooLeagues calls the Python sync service to quickly discover all
// Yahoo Fantasy leagues for the current user WITHOUT persisting them.
func (a *App) DiscoverYahooLeagues(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	log.Printf("[DiscoverYahooLeagues] Hit — X-User-Sub=%q", userID)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var guid string
	err := a.db.QueryRow(context.Background(),
		"SELECT guid FROM yahoo_users WHERE logto_sub = $1", userID,
	).Scan(&guid)
	if err != nil {
		log.Printf("[DiscoverYahooLeagues] No GUID for logto_sub=%s: %v", userID, err)
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Yahoo account not connected",
		})
	}
	log.Printf("[DiscoverYahooLeagues] Resolved logto_sub=%s -> guid=%s", userID, guid)

	internalURL := strings.TrimSuffix(os.Getenv("INTERNAL_YAHOO_URL"), "/")
	if internalURL == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "error",
			Error:  "Internal service URL not configured",
		})
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("POST", internalURL+"/discover/"+guid, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to create request",
		})
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[DiscoverYahooLeagues] Proxy to service failed: %v", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "error",
			Error:  "Sync service unavailable",
		})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}

// ImportYahooLeague calls the Python sync service to import a single league.
func (a *App) ImportYahooLeague(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	log.Printf("[ImportYahooLeague] Hit — X-User-Sub=%q", userID)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var guid string
	err := a.db.QueryRow(context.Background(),
		"SELECT guid FROM yahoo_users WHERE logto_sub = $1", userID,
	).Scan(&guid)
	if err != nil {
		log.Printf("[ImportYahooLeague] No GUID for logto_sub=%s: %v", userID, err)
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Yahoo account not connected",
		})
	}
	log.Printf("[ImportYahooLeague] Resolved logto_sub=%s -> guid=%s", userID, guid)

	// Parse the incoming request body to get league_key, game_code, season
	var incoming struct {
		LeagueKey string `json:"league_key"`
		GameCode  string `json:"game_code"`
		Season    int    `json:"season"`
	}
	if err := c.BodyParser(&incoming); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}
	if incoming.LeagueKey == "" || incoming.GameCode == "" || incoming.Season == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "league_key, game_code, and season are required",
		})
	}

	internalURL := strings.TrimSuffix(os.Getenv("INTERNAL_YAHOO_URL"), "/")
	if internalURL == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "error",
			Error:  "Internal service URL not configured",
		})
	}

	// Build the request body for the Python service (add guid)
	payload, _ := json.Marshal(map[string]interface{}{
		"guid":       guid,
		"league_key": incoming.LeagueKey,
		"game_code":  incoming.GameCode,
		"season":     incoming.Season,
	})

	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequest("POST", internalURL+"/import-league",
		strings.NewReader(string(payload)))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to create request",
		})
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[ImportYahooLeague] Proxy to service failed: %v", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "error",
			Error:  "Sync service unavailable",
		})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}

// DebugYahooState dumps the yahoo_users, yahoo_user_leagues, and yahoo_leagues
// tables so we can inspect stale data.  TEMPORARY — remove after debugging.
func (a *App) DebugYahooState(c *fiber.Ctx) error {
	type userRow struct {
		GUID     string  `json:"guid"`
		LogtoSub string  `json:"logto_sub"`
		LastSync *string `json:"last_sync"`
	}
	type userLeagueRow struct {
		GUID      string `json:"guid"`
		LeagueKey string `json:"league_key"`
	}
	type leagueRow struct {
		LeagueKey string `json:"league_key"`
		GUID      string `json:"guid"`
		Name      string `json:"name"`
		GameCode  string `json:"game_code"`
		Season    string `json:"season"`
	}

	// yahoo_users
	users := make([]userRow, 0)
	uRows, err := a.db.Query(context.Background(), "SELECT guid, logto_sub, last_sync::text FROM yahoo_users ORDER BY logto_sub")
	if err == nil {
		defer uRows.Close()
		for uRows.Next() {
			var u userRow
			var ls *string
			if err := uRows.Scan(&u.GUID, &u.LogtoSub, &ls); err == nil {
				u.LastSync = ls
				users = append(users, u)
			}
		}
	}

	// yahoo_user_leagues
	links := make([]userLeagueRow, 0)
	lRows, err := a.db.Query(context.Background(), "SELECT guid, league_key FROM yahoo_user_leagues ORDER BY guid, league_key")
	if err == nil {
		defer lRows.Close()
		for lRows.Next() {
			var l userLeagueRow
			if err := lRows.Scan(&l.GUID, &l.LeagueKey); err == nil {
				links = append(links, l)
			}
		}
	}

	// yahoo_leagues (metadata only, no data blob)
	leagues := make([]leagueRow, 0)
	lgRows, err := a.db.Query(context.Background(), "SELECT league_key, guid, name, game_code, season FROM yahoo_leagues ORDER BY league_key")
	if err == nil {
		defer lgRows.Close()
		for lgRows.Next() {
			var lg leagueRow
			if err := lgRows.Scan(&lg.LeagueKey, &lg.GUID, &lg.Name, &lg.GameCode, &lg.Season); err == nil {
				leagues = append(leagues, lg)
			}
		}
	}

	// Also dump relevant Redis cache keys
	redisKeys := make([]string, 0)
	iter := a.rdb.Scan(context.Background(), 0, "cache:yahoo:*", 200).Iterator()
	for iter.Next(context.Background()) {
		redisKeys = append(redisKeys, iter.Val())
	}
	tokenKeys := make([]string, 0)
	iter2 := a.rdb.Scan(context.Background(), 0, "token_to_guid:*", 200).Iterator()
	for iter2.Next(context.Background()) {
		val, _ := a.rdb.Get(context.Background(), iter2.Val()).Result()
		tokenKeys = append(tokenKeys, iter2.Val()+"="+val)
	}

	return c.JSON(fiber.Map{
		"yahoo_users":        users,
		"yahoo_user_leagues": links,
		"yahoo_leagues":      leagues,
		"redis_cache_keys":   redisKeys,
		"redis_token_guids":  tokenKeys,
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
