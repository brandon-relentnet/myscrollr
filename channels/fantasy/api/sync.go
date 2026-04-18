package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// =============================================================================
// Background Yahoo Sync Engine
//
// Replaces the Python sync service.  Runs as a goroutine inside the Go API.
// Uses bounded goroutines (semaphore) for concurrent user syncing — each user
// gets its own YahooClient with no shared state.
// =============================================================================

const (
	defaultSyncInterval    = 120 // seconds
	defaultSyncConcurrency = 40
	defaultSyncBatchSize   = 50
	maxSyncRestarts        = 5
	syncRestartDelay       = 10 * time.Second
)

// syncHealth tracks the state of the sync loop for health reporting.
type syncHealth struct {
	mu             sync.RWMutex
	status         string
	lastCycleTime  time.Time
	lastCycleUsers int
	restartCount   int
}

func (sh *syncHealth) setRunning(users int) {
	sh.mu.Lock()
	defer sh.mu.Unlock()
	sh.status = "running"
	sh.lastCycleTime = time.Now()
	sh.lastCycleUsers = users
}

func (sh *syncHealth) setFailed(restarts int) {
	sh.mu.Lock()
	defer sh.mu.Unlock()
	sh.status = "failed"
	sh.restartCount = restarts
}

func (sh *syncHealth) snapshot() map[string]any {
	sh.mu.RLock()
	defer sh.mu.RUnlock()
	m := map[string]any{
		"sync_status":   sh.status,
		"restart_count": sh.restartCount,
	}
	if !sh.lastCycleTime.IsZero() {
		m["last_cycle"] = sh.lastCycleTime.Format(time.RFC3339)
		m["last_cycle_users"] = sh.lastCycleUsers
	}
	return m
}

// ---------------------------------------------------------------------------
// Sync loop with automatic restart
// ---------------------------------------------------------------------------

// startSyncWithRestart runs the sync loop and restarts on crash (up to N times).
func (a *App) startSyncWithRestart(ctx context.Context) {
	var restartCount int

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := a.runSyncLoop(ctx)
		if err == nil || ctx.Err() != nil {
			// Clean exit or context cancelled
			return
		}

		restartCount++
		log.Printf("[Sync] Loop crashed (restart %d/%d): %v", restartCount, maxSyncRestarts, err)

		if restartCount > maxSyncRestarts {
			log.Printf("[Sync] Exceeded max restarts (%d) — giving up", maxSyncRestarts)
			a.syncState.setFailed(restartCount)
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(syncRestartDelay):
			log.Printf("[Sync] Restarting after %v delay...", syncRestartDelay)
		}
	}
}

// runSyncLoop is the main sync cycle.  Fetches users in batches ordered by
// staleness and syncs them concurrently using bounded goroutines.
func (a *App) runSyncLoop(ctx context.Context) error {
	interval := getSyncInterval()
	concurrency := getSyncConcurrency()

	clientID := os.Getenv("YAHOO_CLIENT_ID")
	clientSecret := os.Getenv("YAHOO_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return fmt.Errorf("YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET must be set")
	}

	log.Printf("[Sync] Starting (interval=%ds, concurrency=%d, client_id=%s...)",
		int(interval.Seconds()), concurrency, truncate(clientID, 8))

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		totalSynced := a.runSyncCycle(ctx, clientID, clientSecret, concurrency)
		a.syncState.setRunning(totalSynced)
		log.Printf("[Sync] Cycle complete: %d users synced", totalSynced)

		// Sleep with cancellation
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(interval):
		}
	}
}

// runSyncCycle processes all users in batches with bounded concurrency.
func (a *App) runSyncCycle(ctx context.Context, clientID, clientSecret string, concurrency int) int {
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	var totalSynced atomic.Int32
	offset := 0

	for {
		if ctx.Err() != nil {
			break
		}

		users, err := a.fetchUserBatch(ctx, defaultSyncBatchSize, offset)
		if err != nil {
			log.Printf("[Sync] Failed to fetch user batch: %v", err)
			break
		}
		if len(users) == 0 {
			break
		}

		if offset == 0 {
			log.Printf("[Sync] Starting sync cycle (batch_size=%d, concurrency=%d)...",
				defaultSyncBatchSize, concurrency)
		}

		for _, user := range users {
			if ctx.Err() != nil {
				break
			}

			wg.Add(1)
			sem <- struct{}{} // acquire semaphore slot

			go func(u yahooUser) {
				defer wg.Done()
				defer func() { <-sem }() // release slot

				if ctx.Err() != nil {
					return
				}

				if err := a.syncUser(ctx, u, clientID, clientSecret); err != nil {
					log.Printf("[Sync] Failed user %s: %v", u.guid, err)
				} else {
					totalSynced.Add(1)
				}
			}(user)
		}

		offset += defaultSyncBatchSize
	}

	wg.Wait()
	return int(totalSynced.Load())
}

// ---------------------------------------------------------------------------
// Per-user sync
// ---------------------------------------------------------------------------

// yahooUser holds the data needed to sync a single user.
type yahooUser struct {
	guid         string
	logtoSub     *string
	refreshToken string // plaintext (decrypted)
	lastSync     *time.Time
}

// syncUser syncs all imported leagues for a single user.
// Each user gets its own YahooClient — no shared state between users.
func (a *App) syncUser(ctx context.Context, user yahooUser, clientID, clientSecret string) error {
	client := NewYahooClient(clientID, clientSecret, user.refreshToken)

	// Get this user's imported league keys
	importedKeys, err := a.getUserLeagueKeys(ctx, user.guid)
	if err != nil {
		return fmt.Errorf("get imported league keys: %w", err)
	}
	if len(importedKeys) == 0 {
		return nil // nothing to sync
	}

	// Fetch leagues from Yahoo across all game codes and recent seasons.
	// Include currentYear+1 to catch Yahoo-side early rollover (e.g. 2026 NFL
	// leagues created while it's still 2025 in real-world time, or MLB 2026
	// leagues visible before opening day).
	currentYear := time.Now().Year()
	seasons := []int{currentYear + 1, currentYear, currentYear - 1}
	var allLeagues []leagueSyncItem

	for _, gameCode := range SupportedGameCodes {
		for _, season := range seasons {
			leagues, err := client.GetLeagues(ctx, gameCode, season)
			if err != nil {
				log.Printf("[Sync] No %s leagues for user %s season %d: %v",
					gameCode, user.guid, season, err)
				continue
			}
			for _, leagueData := range leagues {
				lk, _ := leagueData["league_key"].(string)
				if _, imported := importedKeys[lk]; imported {
					allLeagues = append(allLeagues, leagueSyncItem{
						data:     leagueData,
						gameCode: gameCode,
					})
				}
			}
		}
	}

	log.Printf("[Sync] Matched %d imported leagues for user %s", len(allLeagues), user.guid)

	// Upsert league metadata and update team_key
	for _, item := range allLeagues {
		lk, _ := item.data["league_key"].(string)
		name, _ := item.data["name"].(string)
		season := fmt.Sprintf("%v", item.data["season"])

		if err := a.upsertLeague(ctx, lk, name, item.gameCode, season, item.data); err != nil {
			log.Printf("[Sync] Failed upsert league %s: %v", lk, err)
			continue
		}

		// Find user's team in this league and update team_key
		teams, err := client.GetTeams(ctx, lk)
		if err != nil {
			log.Printf("[Sync] Failed to get teams for %s: %v", lk, err)
		} else {
			teamKey, teamName := findUserTeam(teams, user.guid)
			if err := a.upsertUserLeague(ctx, user.guid, lk, teamKey, teamName); err != nil {
				log.Printf("[Sync] Failed upsert user_league %s/%s: %v", user.guid, lk, err)
			}
		}
	}

	// Filter to active (not finished) leagues
	var activeLeagues []leagueSyncItem
	for _, item := range allLeagues {
		isFinished, _ := item.data["is_finished"].(bool)
		if !isFinished {
			activeLeagues = append(activeLeagues, item)
		}
	}

	if skipped := len(allLeagues) - len(activeLeagues); skipped > 0 {
		log.Printf("[Sync] Skipping %d finished leagues", skipped)
	}

	// Sync standings, matchups, and rosters for active leagues
	for _, item := range activeLeagues {
		lk, _ := item.data["league_key"].(string)

		// Standings
		standings, err := client.GetStandings(ctx, lk)
		if err != nil {
			log.Printf("[Sync] Failed standings for %s: %v", lk, err)
		} else if standings != nil {
			if err := a.upsertStandings(ctx, lk, standings); err != nil {
				log.Printf("[Sync] Failed upsert standings for %s: %v", lk, err)
			} else {
				log.Printf("[Sync] Synced standings for %s (%d teams)", lk, len(standings))
			}
		}

		// Matchups — current week + previous week
		currentWeek := 0
		if cw, ok := item.data["current_week"]; ok && cw != nil {
			switch v := cw.(type) {
			case int:
				currentWeek = v
			case *int:
				if v != nil {
					currentWeek = *v
				}
			}
		}

		if currentWeek > 0 {
			weeksToSync := []int{currentWeek}
			if currentWeek > 1 {
				weeksToSync = append(weeksToSync, currentWeek-1)
			}

			for _, weekNum := range weeksToSync {
				wk, matchups, err := client.GetScoreboard(ctx, lk, weekNum)
				if err != nil {
					log.Printf("[Sync] Failed matchups for %s week %d: %v", lk, weekNum, err)
					continue
				}
				if wk <= 0 {
					wk = weekNum
				}
				if matchups != nil {
					if err := a.upsertMatchups(ctx, lk, wk, matchups); err != nil {
						log.Printf("[Sync] Failed upsert matchups for %s week %d: %v", lk, wk, err)
					} else {
						log.Printf("[Sync] Synced %d matchups for %s week %d", len(matchups), lk, wk)
					}
				}
			}
		}

		// Rosters — all teams in the league
		teams, err := client.GetTeams(ctx, lk)
		if err != nil {
			log.Printf("[Sync] Failed to get teams for rosters %s: %v", lk, err)
			continue
		}

		// Fetch the league's authoritative stat catalog + scoring modifiers
		// once per league. The catalog drives label rendering in the UI;
		// modifiers drive synthetic points for H2H/roto points leagues.
		catalog, err := client.GetLeagueStatCatalog(ctx, lk)
		if err != nil {
			log.Printf("[Sync] Failed league stat catalog for %s: %v (continuing without it)", lk, err)
			catalog = nil
		}
		var statModifiers map[string]float64
		if catalog != nil {
			statModifiers = catalog.Modifiers
			// Persist the catalog onto the league row so the dashboard
			// bundle can ship it to the frontend without a second call.
			if err := a.upsertLeagueStatCatalog(ctx, lk, catalog); err != nil {
				log.Printf("[Sync] Failed to persist stat catalog for %s: %v", lk, err)
			}
		}

		for _, team := range teams {
			// Pass currentWeek so Yahoo populates per-player points for that
			// week. If currentWeek is 0 (finished league or missing metadata)
			// the call falls back to a roster-only request.
			roster, err := client.GetRoster(ctx, team.TeamKey, lk, team.Name, currentWeek, statModifiers)
			if err != nil {
				log.Printf("[Sync] Failed roster for %s: %v", team.TeamKey, err)
				continue
			}
			if err := a.upsertRoster(ctx, team.TeamKey, lk, roster); err != nil {
				log.Printf("[Sync] Failed upsert roster for %s: %v", team.TeamKey, err)
			} else {
				log.Printf("[Sync] Synced roster for %s (%s)", team.TeamKey, team.Name)
			}
		}
	}

	// Persist rotated refresh token if changed
	newToken := client.RefreshedToken()
	if newToken != "" && newToken != user.refreshToken {
		log.Printf("[Sync] Refresh token updated for user %s, persisting...", user.guid)
		encrypted, err := Encrypt(newToken)
		if err != nil {
			log.Printf("[Sync] Failed to encrypt rotated token for %s: %v", user.guid, err)
		} else {
			if err := a.updateRefreshToken(ctx, user.guid, encrypted); err != nil {
				log.Printf("[Sync] Failed to persist rotated token for %s: %v", user.guid, err)
			}
		}
	}

	// Mark sync complete
	if err := a.updateUserSyncTime(ctx, user.guid); err != nil {
		log.Printf("[Sync] Failed to update sync time for %s: %v", user.guid, err)
	}

	// Invalidate league cache
	a.invalidateLeagueCache(ctx, user.guid)

	log.Printf("[Sync] Complete for user %s", user.guid)
	return nil
}

type leagueSyncItem struct {
	data     map[string]any
	gameCode string
}

// ---------------------------------------------------------------------------
// Database operations for sync
// ---------------------------------------------------------------------------

func (a *App) fetchUserBatch(ctx context.Context, limit, offset int) ([]yahooUser, error) {
	rows, err := a.db.Query(ctx,
		`SELECT guid, logto_sub, refresh_token, last_sync
		 FROM yahoo_users
		 ORDER BY last_sync ASC NULLS FIRST
		 LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []yahooUser
	for rows.Next() {
		var u yahooUser
		var encryptedToken string
		if err := rows.Scan(&u.guid, &u.logtoSub, &encryptedToken, &u.lastSync); err != nil {
			return nil, err
		}
		plaintext, err := Decrypt(encryptedToken)
		if err != nil {
			log.Printf("[Sync] Failed to decrypt token for user %s: %v", u.guid, err)
			continue
		}
		u.refreshToken = plaintext
		users = append(users, u)
	}

	return users, rows.Err()
}

func (a *App) getUserLeagueKeys(ctx context.Context, guid string) (map[string]*string, error) {
	rows, err := a.db.Query(ctx,
		`SELECT league_key, team_key FROM yahoo_user_leagues WHERE guid = $1`,
		guid,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]*string)
	for rows.Next() {
		var lk string
		var tk *string
		if err := rows.Scan(&lk, &tk); err != nil {
			return nil, err
		}
		result[lk] = tk
	}
	return result, rows.Err()
}

func (a *App) upsertLeague(ctx context.Context, leagueKey, name, gameCode, season string, data map[string]any) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = a.db.Exec(ctx,
		`INSERT INTO yahoo_leagues (league_key, name, game_code, season, data, updated_at)
		 VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (league_key) DO UPDATE
		 SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
		leagueKey, name, gameCode, season, string(jsonData),
	)
	return err
}

// upsertLeagueStatCatalog embeds the league's Yahoo stat_categories +
// modifiers into yahoo_leagues.data under the `stat_catalog` key. Using a
// JSONB merge avoids a migration — the catalog rides alongside existing
// league metadata and is surfaced through LeagueResponse.
func (a *App) upsertLeagueStatCatalog(ctx context.Context, leagueKey string, catalog *LeagueStatCatalog) error {
	if catalog == nil {
		return nil
	}
	jsonData, err := json.Marshal(catalog)
	if err != nil {
		return err
	}
	wrapper := fmt.Sprintf(`{"stat_catalog": %s}`, string(jsonData))
	_, err = a.db.Exec(ctx,
		`UPDATE yahoo_leagues
		   SET data = data || $1::jsonb,
		       updated_at = CURRENT_TIMESTAMP
		 WHERE league_key = $2`,
		wrapper, leagueKey,
	)
	return err
}

func (a *App) upsertStandings(ctx context.Context, leagueKey string, data []map[string]any) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = a.db.Exec(ctx,
		`INSERT INTO yahoo_standings (league_key, data, updated_at)
		 VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (league_key) DO UPDATE
		 SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
		leagueKey, string(jsonData),
	)
	return err
}

func (a *App) upsertMatchups(ctx context.Context, leagueKey string, week int, data []map[string]any) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = a.db.Exec(ctx,
		`INSERT INTO yahoo_matchups (league_key, week, data, updated_at)
		 VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (league_key, week) DO UPDATE
		 SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
		leagueKey, week, string(jsonData),
	)
	return err
}

func (a *App) upsertRoster(ctx context.Context, teamKey, leagueKey string, data map[string]any) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = a.db.Exec(ctx,
		`INSERT INTO yahoo_rosters (team_key, league_key, data, updated_at)
		 VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
		 ON CONFLICT (team_key) DO UPDATE
		 SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
		teamKey, leagueKey, string(jsonData),
	)
	return err
}

func (a *App) upsertUserLeague(ctx context.Context, guid, leagueKey string, teamKey, teamName *string) error {
	_, err := a.db.Exec(ctx,
		`INSERT INTO yahoo_user_leagues (guid, league_key, team_key, team_name)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (guid, league_key) DO UPDATE
		 SET team_key = COALESCE(EXCLUDED.team_key, yahoo_user_leagues.team_key),
		     team_name = COALESCE(EXCLUDED.team_name, yahoo_user_leagues.team_name)`,
		guid, leagueKey, teamKey, teamName,
	)
	return err
}

func (a *App) updateUserSyncTime(ctx context.Context, guid string) error {
	_, err := a.db.Exec(ctx,
		`UPDATE yahoo_users SET last_sync = CURRENT_TIMESTAMP WHERE guid = $1`,
		guid,
	)
	return err
}

func (a *App) updateRefreshToken(ctx context.Context, guid, encryptedToken string) error {
	_, err := a.db.Exec(ctx,
		`UPDATE yahoo_users SET refresh_token = $2 WHERE guid = $1`,
		guid, encryptedToken,
	)
	return err
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

func getSyncInterval() time.Duration {
	raw := os.Getenv("SYNC_INTERVAL_SECS")
	if raw == "" {
		return time.Duration(defaultSyncInterval) * time.Second
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		log.Printf("[Sync] SYNC_INTERVAL_SECS=%q is invalid, defaulting to %ds", raw, defaultSyncInterval)
		return time.Duration(defaultSyncInterval) * time.Second
	}
	return time.Duration(v) * time.Second
}

func getSyncConcurrency() int {
	raw := os.Getenv("SYNC_CONCURRENCY")
	if raw == "" {
		return defaultSyncConcurrency
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		log.Printf("[Sync] SYNC_CONCURRENCY=%q is invalid, defaulting to %d", raw, defaultSyncConcurrency)
		return defaultSyncConcurrency
	}
	return v
}
