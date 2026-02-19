package main

import (
	"context"
	"crypto/rand"
	"database/sql"
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

// =============================================================================
// Yahoo OAuth Flow
// =============================================================================

// YahooStart initiates the Yahoo OAuth flow.
func (a *App) YahooStart(c *fiber.Ctx) error {
	log.Printf("[YahooStart] Hit — query logto_sub=%q, X-User-Sub=%q",
		c.Query("logto_sub"), GetUserSub(c))

	// Extract logto_sub from query parameter (passed by frontend) or X-User-Sub header
	logtoSub := c.Query("logto_sub")
	if logtoSub == "" {
		logtoSub = GetUserSub(c)
	}

	if logtoSub == "" {
		log.Println("[YahooStart] Warning: no logto_sub resolved from any source")
	} else {
		log.Printf("[YahooStart] Resolved logto_sub=%s", logtoSub)
	}

	b := make([]byte, OAuthStateBytes)
	rand.Read(b)
	state := fmt.Sprintf("%x", b)

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
	// the correct Yahoo account.
	authURL := a.yahooConfig.AuthCodeURL(state, oauth2.SetAuthURLParam("prompt", "login"))
	log.Printf("[YahooStart] Redirecting to Yahoo OAuth (state=%s…) redirect_uri=%s", state[:8], a.yahooConfig.RedirectURL)
	return c.Redirect(authURL, fiber.StatusTemporaryRedirect)
}

// YahooCallback handles the Yahoo OAuth callback.
// No cookies are set — the Python service owns all Yahoo token management.
// We only persist the refresh token to Postgres (encrypted) and populate
// Redis CDC subscriber sets.
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

	if token.RefreshToken != "" {
		// Fetch GUID and persist — synchronous so we can return an error page
		// if linking fails.
		log.Printf("[YahooCallback] Linking Yahoo account (logto_sub=%s)…", logtoSub)
		linkErr := a.fetchAndLinkYahooUser(token.AccessToken, token.RefreshToken, logtoSub)
		if linkErr != nil {
			log.Printf("[YahooCallback] Failed to link Yahoo account: %v", linkErr)

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
// upserts the yahoo_users row, and populates the Redis guid→user CDC set.
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
	// *different* Scrollr user.
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

	// Populate Redis guid→user mapping for CDC resolution
	AddSubscriber(a.rdb, context.Background(), RedisGuidUserPrefix+guid, logtoIdentifier)

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
		log.Printf("[GetYahooStatus] DB error for logto_sub=%s: %v", userID, err)
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

// GetMyYahooLeagues returns all leagues + standings + matchups + rosters for
// the authenticated user in a single response. This is the main data endpoint
// for the dashboard — Postgres is the single source of truth.
func (a *App) GetMyYahooLeagues(c *fiber.Ctx) error {
	userID := GetUserSub(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Resolve logto_sub → guid
	var guid string
	err := a.db.QueryRow(context.Background(),
		"SELECT guid FROM yahoo_users WHERE logto_sub = $1", userID).Scan(&guid)
	if err != nil {
		return c.JSON(MyLeaguesResponse{Leagues: []LeagueResponse{}})
	}

	// Fetch all leagues for this user
	leagueRows, err := a.db.Query(context.Background(), `
		SELECT l.league_key, l.name, l.game_code, l.season, l.data,
		       ul.team_key, ul.team_name
		FROM yahoo_leagues l
		JOIN yahoo_user_leagues ul ON l.league_key = ul.league_key
		WHERE ul.guid = $1
		ORDER BY l.game_code, l.season DESC
	`, guid)
	if err != nil {
		log.Printf("[GetMyYahooLeagues] League query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to fetch leagues"})
	}
	defer leagueRows.Close()

	leagues := make([]LeagueResponse, 0)
	leagueKeys := make([]string, 0)
	for leagueRows.Next() {
		var lr LeagueResponse
		if err := leagueRows.Scan(
			&lr.LeagueKey, &lr.Name, &lr.GameCode, &lr.Season, &lr.Data,
			&lr.TeamKey, &lr.TeamName,
		); err != nil {
			log.Printf("[GetMyYahooLeagues] Scan error: %v", err)
			continue
		}
		leagues = append(leagues, lr)
		leagueKeys = append(leagueKeys, lr.LeagueKey)
	}

	if len(leagues) == 0 {
		return c.JSON(MyLeaguesResponse{Leagues: leagues})
	}

	// Batch-fetch standings
	standingsMap := make(map[string]json.RawMessage)
	standingsRows, err := a.db.Query(context.Background(),
		"SELECT league_key, data FROM yahoo_standings WHERE league_key = ANY($1)", leagueKeys)
	if err == nil {
		defer standingsRows.Close()
		for standingsRows.Next() {
			var lk string
			var data json.RawMessage
			if err := standingsRows.Scan(&lk, &data); err == nil {
				standingsMap[lk] = data
			}
		}
	}

	// Batch-fetch current matchups (most recent week per league)
	matchupsMap := make(map[string]json.RawMessage)
	matchupsRows, err := a.db.Query(context.Background(), `
		SELECT DISTINCT ON (league_key) league_key, data
		FROM yahoo_matchups
		WHERE league_key = ANY($1)
		ORDER BY league_key, week DESC
	`, leagueKeys)
	if err == nil {
		defer matchupsRows.Close()
		for matchupsRows.Next() {
			var lk string
			var data json.RawMessage
			if err := matchupsRows.Scan(&lk, &data); err == nil {
				matchupsMap[lk] = data
			}
		}
	}

	// Batch-fetch all rosters grouped by league
	rostersMap := make(map[string]json.RawMessage)
	rostersRows, err := a.db.Query(context.Background(), `
		SELECT league_key,
		       json_agg(json_build_object('team_key', team_key, 'data', data)) AS rosters
		FROM yahoo_rosters
		WHERE league_key = ANY($1)
		GROUP BY league_key
	`, leagueKeys)
	if err == nil {
		defer rostersRows.Close()
		for rostersRows.Next() {
			var lk string
			var data json.RawMessage
			if err := rostersRows.Scan(&lk, &data); err == nil {
				rostersMap[lk] = data
			}
		}
	}

	// Attach data to each league
	for i := range leagues {
		lk := leagues[i].LeagueKey
		if s, ok := standingsMap[lk]; ok {
			leagues[i].Standings = s
		}
		if m, ok := matchupsMap[lk]; ok {
			leagues[i].Matchups = m
		}
		if r, ok := rostersMap[lk]; ok {
			leagues[i].Rosters = r
		}
	}

	return c.JSON(MyLeaguesResponse{Leagues: leagues})
}

// DiscoverYahooLeagues calls the Python sync service to quickly discover all
// Yahoo Fantasy leagues for the current user WITHOUT persisting them.
func (a *App) DiscoverYahooLeagues(c *fiber.Ctx) error {
	userID := GetUserSub(c)
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
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Yahoo account not connected",
		})
	}

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

	respBody, _ := io.ReadAll(resp.Body)
	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(respBody)
}

// ImportYahooLeague calls the Python sync service to import a single league,
// then populates the Redis CDC subscriber set for that league.
func (a *App) ImportYahooLeague(c *fiber.Ctx) error {
	userID := GetUserSub(c)
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
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Yahoo account not connected",
		})
	}

	// Parse the incoming request body
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

	respBody, _ := io.ReadAll(resp.Body)

	// On successful import, populate Redis CDC subscriber sets
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		ctx := context.Background()
		a.AddLeagueSubscriber(ctx, incoming.LeagueKey, userID)
		// Also ensure guid→user mapping exists
		AddSubscriber(a.rdb, ctx, RedisGuidUserPrefix+guid, userID)
		log.Printf("[ImportYahooLeague] Added user %s to CDC set for league %s", userID, incoming.LeagueKey)
	}

	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(respBody)
}

// DisconnectYahoo removes the user's Yahoo connection and all associated data,
// including Redis CDC subscriber sets.
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
	err := a.db.QueryRow(context.Background(),
		"SELECT guid FROM yahoo_users WHERE logto_sub = $1", userID).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"status": "ok", "message": "No Yahoo account connected"})
	}

	// Clean up Redis CDC subscriber sets BEFORE deleting DB rows
	// (we need the user_leagues data to know which sets to clean)
	a.CleanupLeagueSubscribers(context.Background(), guid, userID)

	// Delete from yahoo_users — cascading deletes handle leagues, standings, etc.
	_, err = a.db.Exec(context.Background(),
		"DELETE FROM yahoo_users WHERE logto_sub = $1", userID)
	if err != nil {
		log.Printf("[DisconnectYahoo] Error deleting yahoo_users: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to disconnect Yahoo account",
		})
	}

	log.Printf("[DisconnectYahoo] User %s disconnected Yahoo (GUID: %s)", userID, guid)
	return c.JSON(fiber.Map{"status": "ok", "message": "Yahoo account disconnected"})
}
