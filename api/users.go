package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

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
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	var lastSync sql.NullTime
	err := dbPool.QueryRow(context.Background(), `
		SELECT last_sync FROM yahoo_users WHERE logto_sub = $1
	`, userID).Scan(&lastSync)

	if err != nil {
		errStr := err.Error()
		if err == sql.ErrNoRows || contains(errStr, "no rows") {
			return c.JSON(YahooStatusResponse{Connected: false, Synced: false})
		}
		log.Printf("[GetYahooStatus] Error: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
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
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
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
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{Status: "error", Error: "Failed to fetch leagues"})
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

// GetProfileByUsername returns basic profile info (Logto-sourced username + Yahoo status)
func GetProfileByUsername(c *fiber.Ctx) error {
	username := c.Params("username")
	if username == "" {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
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

// getUserEmail extracts the user email from the Fiber context (set by LogtoAuth middleware)
func getUserEmail(c *fiber.Ctx) string {
	if email, ok := c.Locals("user_email").(string); ok {
		return email
	}
	return ""
}

// getUsername extracts the username from the Fiber context (set by LogtoAuth middleware)
func getUsername(c *fiber.Ctx) string {
	if username, ok := c.Locals("username").(string); ok {
		return username
	}
	return ""
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
