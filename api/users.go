package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// YahooStatusResponse returns whether user has Yahoo connected
type YahooStatusResponse struct {
	Connected bool   `json:"connected"`
	Synced    bool   `json:"synced"`
}

// GetYahooStatus returns whether the current user has Yahoo connected
func GetYahooStatus(c *fiber.Ctx) error {
	userID := getUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var lastSync sql.NullTime
	err := dbPool.QueryRow(context.Background(), `
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

	// Row exists = user connected Yahoo, last_sync set = data has been synced
	return c.JSON(YahooStatusResponse{
		Connected: true,
		Synced:    lastSync.Valid,
	})
}

// GetMyYahooLeagues returns all yahoo leagues + standings for the authenticated user
func GetMyYahooLeagues(c *fiber.Ctx) error {
	userID := getUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Get user's GUID from logto_sub
	var guid string
	err := dbPool.QueryRow(context.Background(), `
		SELECT guid FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&guid)
	if err != nil {
		return c.JSON(fiber.Map{"leagues": []any{}, "standings": map[string]any{}, "matchups": map[string]any{}})
	}

	// Fetch all leagues for this user
	leagueRows, err := dbPool.Query(context.Background(), `
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
		standingsRows, err := dbPool.Query(context.Background(), `
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

// DisconnectYahoo removes the user's Yahoo connection and all associated data
func DisconnectYahoo(c *fiber.Ctx) error {
	userID := getUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	// Look up the user's Yahoo GUID before deleting
	var guid string
	err := dbPool.QueryRow(context.Background(), `
		SELECT guid FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&guid)
	if err != nil {
		// No Yahoo connection found — nothing to disconnect
		return c.JSON(fiber.Map{"status": "ok", "message": "No Yahoo account connected"})
	}

	// Delete from yahoo_users — cascades to yahoo_leagues, yahoo_standings, yahoo_rosters
	_, err = dbPool.Exec(context.Background(), `
		DELETE FROM yahoo_users WHERE logto_sub = $1
	`, userID)
	if err != nil {
		log.Printf("[DisconnectYahoo] Error deleting yahoo_users: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to disconnect Yahoo account",
		})
	}

	// Clean up orphaned yahoo_matchups (no FK cascade)
	// We don't have a direct link, but matchup team_keys start with league_keys
	// For now, just log the disconnect — matchups will be overwritten on reconnect

	// Clear Redis cache keys for this user
	cacheKeys := []string{
		CacheKeyYahooLeaguesPrefix + guid,
	}
	for _, key := range cacheKeys {
		rdb.Del(context.Background(), key)
	}

	// Clear any token_to_guid mappings (scan for matching GUID values)
	iter := rdb.Scan(context.Background(), 0, RedisTokenToGuidPrefix+"*", RedisScanCount).Iterator()
	for iter.Next(context.Background()) {
		val, err := rdb.Get(context.Background(), iter.Val()).Result()
		if err == nil && val == guid {
			rdb.Del(context.Background(), iter.Val())
		}
	}

	log.Printf("[DisconnectYahoo] User %s disconnected Yahoo (GUID: %s)", userID, guid)
	return c.JSON(fiber.Map{"status": "ok", "message": "Yahoo account disconnected"})
}

// GetProfileByUsername returns basic profile info (Logto-sourced username + Yahoo status)
func GetProfileByUsername(c *fiber.Ctx) error {
	username := c.Params("username")
	if username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username is required",
		})
	}

	// Username comes from Logto - we don't store it
	// Just check if they have Yahoo connected for any additional info
	connected := false
	var lastSync sql.NullTime
	err := dbPool.QueryRow(context.Background(), `
		SELECT last_sync FROM yahoo_users WHERE guid = $1
	`, username).Scan(&lastSync)
	if err == nil && lastSync.Valid {
		connected = true
	}

	return c.JSON(fiber.Map{
		"username":         username,
		"connected_yahoo": connected,
	})
}

// getUserID extracts the user ID from the Fiber context (set by LogtoAuth middleware)
func getUserID(c *fiber.Ctx) string {
	if userID, ok := c.Locals("user_id").(string); ok {
		return userID
	}
	return ""
}


