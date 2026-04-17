package main

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// =============================================================================
// Yahoo Fantasy API Client
//
// Pure Go replacement for the yahoofantasy Python library.  Each user gets
// their own YahooClient instance — no global state, no locks between users.
//
// API reference: https://fantasysports.yahooapis.com/fantasy/v2/
// All responses are XML.  Headers: Authorization: Bearer, User-Agent: Mozilla/5.0
// =============================================================================

const (
	defaultYahooBaseURL  = "https://fantasysports.yahooapis.com/fantasy/v2"
	defaultYahooTokenURL = "https://api.login.yahoo.com/oauth2/get_token"
	yahooUA              = "Mozilla/5.0"

	// Default delay between Yahoo API calls (per-user rate limiting).
	DefaultAPIDelay = 500 * time.Millisecond

	// Retry configuration
	maxRetries     = 3
	retryBaseDelay = 1 * time.Second
)

// yahooBaseURL returns the Yahoo Fantasy API base URL, overridable via
// YAHOO_API_BASE_URL for local testing with mock servers.
func getYahooBaseURL() string {
	if v := os.Getenv("YAHOO_API_BASE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return defaultYahooBaseURL
}

// yahooTokenURL returns the Yahoo OAuth2 token endpoint, overridable via
// YAHOO_TOKEN_URL for local testing with mock servers.
func getYahooTokenURL() string {
	if v := os.Getenv("YAHOO_TOKEN_URL"); v != "" {
		return v
	}
	return defaultYahooTokenURL
}

// YahooClient is a per-user Yahoo Fantasy API client.  Each instance holds
// its own access token and refresh token — no shared global state.
type YahooClient struct {
	httpClient   *http.Client
	clientID     string
	clientSecret string
	apiDelay     time.Duration

	mu           sync.Mutex // protects token fields within this client
	accessToken  string
	tokenExpiry  time.Time
	refreshToken string // may be rotated by Yahoo on each refresh
}

// NewYahooClient creates a client for a specific user's Yahoo session.
func NewYahooClient(clientID, clientSecret, refreshToken string) *YahooClient {
	return &YahooClient{
		httpClient:   &http.Client{Timeout: 30 * time.Second},
		clientID:     clientID,
		clientSecret: clientSecret,
		refreshToken: refreshToken,
		apiDelay:     DefaultAPIDelay,
	}
}

// RefreshedToken returns the current refresh token.  Yahoo rotates tokens on
// each refresh, so this may differ from the original after API calls.
func (yc *YahooClient) RefreshedToken() string {
	yc.mu.Lock()
	defer yc.mu.Unlock()
	return yc.refreshToken
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

// refreshAccessToken exchanges the refresh token for a new access token.
// POST https://api.login.yahoo.com/oauth2/get_token
func (yc *YahooClient) refreshAccessToken(ctx context.Context) error {
	yc.mu.Lock()
	defer yc.mu.Unlock()

	// Skip if token is still valid (another goroutine may have refreshed it)
	if yc.accessToken != "" && time.Now().Before(yc.tokenExpiry) {
		return nil
	}

	form := url.Values{
		"client_id":     {yc.clientID},
		"client_secret": {yc.clientSecret},
		"refresh_token": {yc.refreshToken},
		"grant_type":    {"refresh_token"},
	}

	req, err := http.NewRequestWithContext(ctx, "POST", getYahooTokenURL(), strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("yahoo token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := yc.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("yahoo token exchange: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("yahoo token refresh failed (status %d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return fmt.Errorf("yahoo token parse: %w", err)
	}

	yc.accessToken = tokenResp.AccessToken
	yc.tokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// Yahoo rotates refresh tokens on each use
	if tokenResp.RefreshToken != "" {
		yc.refreshToken = tokenResp.RefreshToken
	}

	return nil
}

// ensureToken refreshes the access token if it's missing or expired.
func (yc *YahooClient) ensureToken(ctx context.Context) error {
	yc.mu.Lock()
	valid := yc.accessToken != "" && time.Now().Before(yc.tokenExpiry)
	yc.mu.Unlock()

	if valid {
		return nil
	}
	return yc.refreshAccessToken(ctx)
}

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------

// makeRequest sends an authenticated GET to the Yahoo Fantasy API.
// urlPath is appended to the base URL (e.g., "league/449.l.12345/standings").
func (yc *YahooClient) makeRequest(ctx context.Context, urlPath string) ([]byte, error) {
	if err := yc.ensureToken(ctx); err != nil {
		return nil, err
	}

	fullURL := getYahooBaseURL() + "/" + urlPath

	req, err := http.NewRequestWithContext(ctx, "GET", fullURL, nil)
	if err != nil {
		return nil, fmt.Errorf("yahoo request build: %w", err)
	}

	yc.mu.Lock()
	token := yc.accessToken
	yc.mu.Unlock()

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", yahooUA)

	resp, err := yc.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("yahoo request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("yahoo read body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("yahoo API error (status %d) for %s: %s", resp.StatusCode, urlPath, truncate(string(body), 200))
	}

	return body, nil
}

// withRetry wraps a function with exponential backoff retry and per-user API delay.
func (yc *YahooClient) withRetry(ctx context.Context, label string, fn func() error) error {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Per-user API delay before each attempt
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(yc.apiDelay):
		}

		lastErr = fn()
		if lastErr == nil {
			return nil
		}

		if attempt == maxRetries-1 {
			break
		}

		// Exponential backoff with jitter
		delay := retryBaseDelay * time.Duration(1<<uint(attempt))
		jitter := time.Duration(rand.Int63n(int64(500 * time.Millisecond)))
		log.Printf("[Retry] %s attempt %d/%d failed, retrying in %v: %v", label, attempt+1, maxRetries, delay+jitter, lastErr)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay + jitter):
		}
	}

	log.Printf("[Retry] %s failed after %d attempts: %v", label, maxRetries, lastErr)
	return lastErr
}

// ---------------------------------------------------------------------------
// API Methods — each returns serialized data matching the Python serializers
// ---------------------------------------------------------------------------

// GetLeagues fetches all leagues for the authenticated user in a game/season.
// Returns serialized league metadata dicts (same shape as Python serialize_league).
func (yc *YahooClient) GetLeagues(ctx context.Context, gameCode string, season int) ([]map[string]any, error) {
	gameKey, err := ResolveGameKey(ctx, yc, gameCode, season)
	if err != nil {
		return nil, err
	}

	urlPath := fmt.Sprintf("users;use_login=1/games;game_keys=%d/leagues", gameKey)

	var xmlBody []byte
	err = yc.withRetry(ctx, fmt.Sprintf("leagues(%s,%d)", gameCode, season), func() error {
		var reqErr error
		xmlBody, reqErr = yc.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return nil, err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return nil, fmt.Errorf("parse leagues XML: %w", err)
	}

	var result []map[string]any

	if fc.Users == nil {
		return result, nil
	}
	for _, user := range fc.Users.User {
		if user.Games == nil {
			continue
		}
		for _, game := range user.Games.Game {
			for _, league := range game.Leagues.League {
				result = append(result, serializeLeague(league, gameCode))
			}
		}
	}

	return result, nil
}

// GetStandings fetches standings for a league.
// Returns serialized standings array (same shape as Python serialize_standings).
func (yc *YahooClient) GetStandings(ctx context.Context, leagueKey string) ([]map[string]any, error) {
	urlPath := fmt.Sprintf("league/%s/standings", leagueKey)

	var xmlBody []byte
	err := yc.withRetry(ctx, fmt.Sprintf("standings(%s)", leagueKey), func() error {
		var reqErr error
		xmlBody, reqErr = yc.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return nil, err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return nil, fmt.Errorf("parse standings XML: %w", err)
	}

	if fc.League == nil || fc.League.Standings == nil {
		return nil, nil
	}

	return serializeStandings(fc.League.Standings.Teams.Team), nil
}

// GetScoreboard fetches matchups for a specific week.
// Returns (weekNum, serialized matchups array).
func (yc *YahooClient) GetScoreboard(ctx context.Context, leagueKey string, week int) (int, []map[string]any, error) {
	urlPath := fmt.Sprintf("league/%s/scoreboard;week=%d", leagueKey, week)

	var xmlBody []byte
	err := yc.withRetry(ctx, fmt.Sprintf("scoreboard(%s,wk%d)", leagueKey, week), func() error {
		var reqErr error
		xmlBody, reqErr = yc.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return 0, nil, err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return 0, nil, fmt.Errorf("parse scoreboard XML: %w", err)
	}

	if fc.League == nil || fc.League.Scoreboard == nil {
		return week, nil, nil
	}

	weekNum, matchups := serializeScoreboard(fc.League.Scoreboard, week)
	return weekNum, matchups, nil
}

// GetTeams fetches all teams in a league.  Returns the raw XML team structs
// (used by sync to find user's team and iterate rosters).
func (yc *YahooClient) GetTeams(ctx context.Context, leagueKey string) ([]XMLTeamStanding, error) {
	urlPath := fmt.Sprintf("league/%s/teams", leagueKey)

	var xmlBody []byte
	err := yc.withRetry(ctx, fmt.Sprintf("teams(%s)", leagueKey), func() error {
		var reqErr error
		xmlBody, reqErr = yc.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return nil, err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return nil, fmt.Errorf("parse teams XML: %w", err)
	}

	if fc.League == nil || fc.League.Teams == nil {
		return nil, nil
	}

	return fc.League.Teams.Team, nil
}

// GetLeagueSettings fetches the league's stat categories and their point
// modifiers. Used to compute synthetic player points in category leagues
// (e.g. MLB head-to-head categories) where Yahoo doesn't ship a per-player
// <player_points> total in roster responses.
//
// Returns a map stat_id -> point modifier. For categories leagues with no
// modifiers, each enabled stat maps to 0.0 and callers should ignore points.
func (yc *YahooClient) GetLeagueSettings(ctx context.Context, leagueKey string) (map[string]float64, error) {
	urlPath := fmt.Sprintf("league/%s/settings", leagueKey)

	var xmlBody []byte
	err := yc.withRetry(ctx, fmt.Sprintf("settings(%s)", leagueKey), func() error {
		var reqErr error
		xmlBody, reqErr = yc.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return nil, err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return nil, fmt.Errorf("parse league settings XML: %w", err)
	}

	if fc.League == nil || fc.League.Settings == nil {
		return nil, nil
	}

	modifiers := map[string]float64{}
	for _, mod := range fc.League.Settings.StatModifiers.Stats.Stat {
		if mod.StatID == "" {
			continue
		}
		v, err := strconv.ParseFloat(mod.Value, 64)
		if err != nil {
			continue
		}
		modifiers[mod.StatID] = v
	}
	return modifiers, nil
}

// GetRoster fetches the live roster for a team. When `week` > 0 we request
// the stats subresource pinned to that week, which is the only Yahoo endpoint
// that populates each player's <player_points> element. When `week` is 0 we
// fall back to the plain roster URL — the serialized players will be missing
// `player_points` in that case.
//
// `statModifiers` is an optional stat_id -> point value map. When provided
// (typically from GetLeagueSettings), serializeRoster uses it to compute
// synthetic player points in category leagues where Yahoo doesn't ship
// <player_points>. Pass nil for points-native leagues.
//
// Returns a serialized roster dict (same shape as Python serialize_roster).
func (yc *YahooClient) GetRoster(
	ctx context.Context,
	teamKey, leagueKey, teamName string,
	week int,
	statModifiers map[string]float64,
) (map[string]any, error) {
	// Note: roster URL uses team key directly (not league-prefixed)
	var urlPath string
	if week > 0 {
		// Pin the lineup AND the stats to the same week so player_points is populated.
		urlPath = fmt.Sprintf("team/%s/roster;week=%d/players/stats;type=week;week=%d", teamKey, week, week)
	} else {
		urlPath = fmt.Sprintf("team/%s/roster;", teamKey)
	}

	var xmlBody []byte
	err := yc.withRetry(ctx, fmt.Sprintf("roster(%s,week=%d)", teamKey, week), func() error {
		var reqErr error
		xmlBody, reqErr = yc.makeRequest(ctx, urlPath)
		return reqErr
	})
	if err != nil {
		return nil, err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return nil, fmt.Errorf("parse roster XML: %w", err)
	}

	if fc.Team == nil || fc.Team.Roster == nil {
		return map[string]any{
			"team_key":  teamKey,
			"team_name": teamName,
			"players":   []any{},
		}, nil
	}

	return serializeRoster(fc.Team.Roster.Players.Player, teamKey, teamName, statModifiers), nil
}

// GetUserGUID fetches the authenticated user's Yahoo GUID.
func (yc *YahooClient) GetUserGUID(ctx context.Context) (string, error) {
	xmlBody, err := yc.makeRequest(ctx, "users;use_login=1")
	if err != nil {
		return "", err
	}

	var fc FantasyContent
	if err := xml.Unmarshal(xmlBody, &fc); err != nil {
		return "", fmt.Errorf("parse user XML: %w", err)
	}

	if fc.Users == nil || len(fc.Users.User) == 0 {
		return "", fmt.Errorf("no user found in Yahoo response")
	}

	return fc.Users.User[0].Guid, nil
}

// =============================================================================
// Serializers — convert XML structs to JSON maps for Postgres JSONB columns.
// Produces the EXACT same shapes as the Python serializers.py.
// =============================================================================

// serializeLeague converts an XMLLeague to the flat dict stored in yahoo_leagues.data.
func serializeLeague(l XMLLeague, gameCode string) map[string]any {
	season := safeAtoi(l.Season)
	isFinished := computeIsFinished(l.IsFinished, season)

	return map[string]any{
		"league_key":   l.LeagueKey,
		"league_id":    safeAtoi(l.LeagueID),
		"name":         l.Name,
		"url":          l.URL,
		"logo_url":     l.LogoURL,
		"draft_status": l.DraftStatus,
		"num_teams":    safeAtoi(l.NumTeams),
		"scoring_type": l.ScoringType,
		"league_type":  l.LeagueType,
		"current_week": safeAtoiPtr(l.CurrentWeek),
		"start_week":   safeAtoiPtr(l.StartWeek),
		"end_week":     safeAtoiPtr(l.EndWeek),
		"is_finished":  isFinished,
		"season":       season,
		"game_code":    gameCode,
	}
}

// computeIsFinished derives the is_finished flag from Yahoo data:
//   - is_finished == "1"   -> true
//   - is_finished == "0"   -> false
//   - missing/nil          -> default false when the season is current or in
//     the future, true only if the season is strictly older than last year.
//     The conservative default prevents a just-linked 2025 league from being
//     marked finished while we're early in 2026 (before it actually ends).
func computeIsFinished(raw *string, season int) bool {
	if raw != nil {
		if *raw == "1" {
			return true
		}
		if *raw == "0" {
			return false
		}
	}
	currentYear := time.Now().Year()
	return season < currentYear-1
}

// serializeStandings converts XML team standings to the JSON array stored
// in yahoo_standings.data.
func serializeStandings(teams []XMLTeamStanding) []map[string]any {
	result := make([]map[string]any, 0, len(teams))

	for _, t := range teams {
		ts := t.TeamStandingsData
		var wins, losses, ties int
		var percentage, gamesBack, pointsFor, pointsAgainst string
		var rank, playoffSeed *int
		var streakType string
		var streakValue int

		if ts != nil {
			if ts.OutcomeTotals != nil {
				wins = safeAtoi(ts.OutcomeTotals.Wins)
				losses = safeAtoi(ts.OutcomeTotals.Losses)
				ties = safeAtoi(ts.OutcomeTotals.Ties)
				percentage = ts.OutcomeTotals.Percentage
			}
			if percentage == "" {
				percentage = "0.0"
			}
			gamesBack = ptrOrDefault(ts.GamesBack, "0.0")
			pointsFor = ptrOrDefault(ts.PointsFor, "0")
			pointsAgainst = ptrOrDefault(ts.PointsAgainst, "0")
			rank = safeAtoiPtr(ts.Rank)
			playoffSeed = safeAtoiPtr(ts.PlayoffSeed)
			if ts.Streak != nil {
				streakType = ts.Streak.Type
				streakValue = safeAtoi(ts.Streak.Value)
			}
		} else {
			percentage = "0.0"
			gamesBack = "0.0"
			pointsFor = "0"
			pointsAgainst = "0"
		}

		clinched := false
		if t.ClinchPlayoffs != nil && *t.ClinchPlayoffs == "1" {
			clinched = true
		}

		result = append(result, map[string]any{
			"team_key":          t.TeamKey,
			"team_id":           safeAtoi(t.TeamID),
			"name":              t.Name,
			"url":               t.URL,
			"team_logo":         extractTeamLogo(t.TeamLogos, t.TeamLogo),
			"manager_name":      extractManagerName(t.Managers),
			"rank":              rank,
			"wins":              wins,
			"losses":            losses,
			"ties":              ties,
			"percentage":        percentage,
			"games_back":        gamesBack,
			"points_for":        pointsFor,
			"points_against":    pointsAgainst,
			"streak_type":       streakType,
			"streak_value":      streakValue,
			"playoff_seed":      playoffSeed,
			"clinched_playoffs": clinched,
			"waiver_priority":   safeAtoiPtr(t.WaiverPriority),
		})
	}

	return result
}

// serializeScoreboard converts XML scoreboard data to (weekNum, matchups).
func serializeScoreboard(sb *XMLScoreboard, fallbackWeek int) (int, []map[string]any) {
	result := make([]map[string]any, 0, len(sb.Matchups.Matchup))
	weekNum := fallbackWeek

	for _, m := range sb.Matchups.Matchup {
		wk := safeAtoi(m.Week)
		if wk > 0 {
			weekNum = wk
		}

		teams := make([]map[string]any, 0, len(m.Teams.Team))
		for _, t := range m.Teams.Team {
			teams = append(teams, serializeMatchupTeam(t))
		}

		var winnerKey *string
		if m.WinnerTeamKey != "" {
			winnerKey = &m.WinnerTeamKey
		}

		result = append(result, map[string]any{
			"week":            wk,
			"week_start":      m.WeekStart,
			"week_end":        m.WeekEnd,
			"status":          m.Status,
			"is_playoffs":     m.IsPlayoffs == "1",
			"is_consolation":  m.IsConsolation == "1",
			"is_tied":         m.IsTied == "1",
			"winner_team_key": winnerKey,
			"teams":           teams,
		})
	}

	// Use scoreboard-level week if available
	if sbWeek := safeAtoi(sb.Week); sbWeek > 0 {
		weekNum = sbWeek
	}

	return weekNum, result
}

func serializeMatchupTeam(t XMLMatchupTeam) map[string]any {
	var points, projected *float64

	if t.TeamPoints != nil {
		if v, err := strconv.ParseFloat(t.TeamPoints.Total, 64); err == nil {
			points = &v
		}
	}
	if t.TeamProjectedPoints != nil {
		if v, err := strconv.ParseFloat(t.TeamProjectedPoints.Total, 64); err == nil {
			projected = &v
		}
	}

	return map[string]any{
		"team_key":         t.TeamKey,
		"team_id":          safeAtoi(t.TeamID),
		"name":             t.Name,
		"team_logo":        extractTeamLogo(t.TeamLogos, t.TeamLogo),
		"manager_name":     extractManagerName(t.Managers),
		"points":           points,
		"projected_points": projected,
	}
}

// serializeRoster converts XML player list to the dict stored in yahoo_rosters.data.
//
// `statModifiers` maps Yahoo stat_id -> point value. When non-nil and the
// player's <player_points> element is missing (category leagues), we compute
// a synthetic points total by summing stat_value * modifier across categories.
// The raw per-stat values are also exposed as `player_stats` so the UI can
// show categorical breakdowns when desired.
func serializeRoster(
	players []XMLPlayer,
	teamKey, teamName string,
	statModifiers map[string]float64,
) map[string]any {
	serialized := make([]map[string]any, 0, len(players))

	for _, p := range players {
		var selectedPos string
		if p.SelectedPosition != nil {
			selectedPos = p.SelectedPosition.Position
		}

		var eligiblePos []string
		if p.EligiblePositions != nil {
			eligiblePos = p.EligiblePositions.Position
		}
		if eligiblePos == nil {
			eligiblePos = []string{}
		}

		var playerPoints *float64
		if p.PlayerPoints != nil {
			if v, err := strconv.ParseFloat(p.PlayerPoints.Total, 64); err == nil {
				playerPoints = &v
			}
		}

		// Raw stats map for category leagues.
		playerStats := map[string]float64{}
		if p.PlayerStats != nil {
			for _, s := range p.PlayerStats.Stats.Stat {
				if s.StatID == "" {
					continue
				}
				v, err := strconv.ParseFloat(s.Value, 64)
				if err != nil {
					continue
				}
				playerStats[s.StatID] = v
			}
		}

		// Synthetic points for category leagues: sum(stat_value * modifier).
		// Only populate when Yahoo didn't provide native player_points AND we
		// have modifiers + stats to work with.
		if playerPoints == nil && len(statModifiers) > 0 && len(playerStats) > 0 {
			var total float64
			var matched int
			for statID, val := range playerStats {
				if mod, ok := statModifiers[statID]; ok {
					total += val * mod
					matched++
				}
			}
			if matched > 0 {
				playerPoints = &total
			}
		}

		var status, statusFull, injuryNote string
		if p.Status != "" {
			status = p.Status
		}
		if p.StatusFull != "" {
			statusFull = p.StatusFull
		}
		if p.InjuryNote != "" {
			injuryNote = p.InjuryNote
		}

		playerMap := map[string]any{
			"player_key":               p.PlayerKey,
			"player_id":                safeAtoi(p.PlayerID),
			"name":                     map[string]any{"full": p.Name.Full, "first": p.Name.First, "last": p.Name.Last},
			"editorial_team_abbr":      p.EditorialTeamAbbr,
			"editorial_team_full_name": p.EditorialTeamFullName,
			"display_position":         p.DisplayPosition,
			"selected_position":        selectedPos,
			"eligible_positions":       eligiblePos,
			"image_url":                p.ImageURL,
			"position_type":            p.PositionType,
			"status":                   status,
			"status_full":              statusFull,
			"injury_note":              injuryNote,
			"player_points":            playerPoints,
		}
		if len(playerStats) > 0 {
			playerMap["player_stats"] = playerStats
		}
		serialized = append(serialized, playerMap)
	}

	return map[string]any{
		"team_key":  teamKey,
		"team_name": teamName,
		"players":   serialized,
	}
}

// =============================================================================
// Helpers
// =============================================================================

// extractTeamLogo gets the logo URL from XML structures (handles multiple nesting patterns).
func extractTeamLogo(logos *XMLTeamLogos, fallback string) string {
	if logos != nil && len(logos.TeamLogo) > 0 {
		return logos.TeamLogo[0].URL
	}
	return fallback
}

// extractManagerName gets the primary manager's nickname.
func extractManagerName(managers *XMLManagers) string {
	if managers != nil && len(managers.Manager) > 0 {
		return managers.Manager[0].Nickname
	}
	return ""
}

// findUserTeam finds the user's team_key and team_name in a list of teams
// by matching manager GUID.
func findUserTeam(teams []XMLTeamStanding, userGUID string) (*string, *string) {
	for _, t := range teams {
		if t.Managers == nil {
			continue
		}
		for _, m := range t.Managers.Manager {
			if m.Guid == userGUID {
				tk := t.TeamKey
				tn := t.Name
				return &tk, &tn
			}
		}
	}
	return nil, nil
}

// safeAtoi converts a string to int, returning 0 on failure.
func safeAtoi(s string) int {
	v, _ := strconv.Atoi(s)
	return v
}

// safeAtoiPtr converts a *string to *int, returning nil if input is nil or invalid.
func safeAtoiPtr(s *string) *int {
	if s == nil || *s == "" {
		return nil
	}
	v, err := strconv.Atoi(*s)
	if err != nil {
		return nil
	}
	return &v
}

// ptrOrDefault dereferences a *string, returning a default if nil.
func ptrOrDefault(s *string, def string) string {
	if s == nil {
		return def
	}
	return *s
}

// truncate shortens a string for log output.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
