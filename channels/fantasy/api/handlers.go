package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v2"
)

// =============================================================================
// Database Helpers
// =============================================================================

// UpsertYahooUser inserts or updates a Yahoo user with an encrypted refresh token.
func (a *App) UpsertYahooUser(guid, logtoSub, refreshToken string) error {
	encryptedToken, err := Encrypt(refreshToken)
	if err != nil {
		log.Printf("[Security Error] Failed to encrypt refresh token for user %s: %v", guid, err)
		return err
	}

	_, err = a.db.Exec(context.Background(), `
		INSERT INTO yahoo_users (guid, logto_sub, refresh_token)
		VALUES ($1, $2, $3)
		ON CONFLICT (guid) DO UPDATE
		SET logto_sub = EXCLUDED.logto_sub, refresh_token = EXCLUDED.refresh_token;
	`, guid, logtoSub, encryptedToken)

	return err
}

// =============================================================================
// Redis CDC Subscriber Set Management
// =============================================================================

// PopulateLeagueSubscribers adds a user to all their league subscriber sets
// and sets the guid→user mapping. Called after ImportYahooLeague succeeds.
func (a *App) PopulateLeagueSubscribers(ctx context.Context, guid, logtoSub string) error {
	// Set guid → logto_sub mapping for yahoo_leagues CDC resolution
	AddSubscriber(a.rdb, ctx, RedisGuidUserPrefix+guid, logtoSub)

	// Find all leagues this user belongs to and add them to per-league sets
	rows, err := a.db.Query(ctx,
		"SELECT league_key FROM yahoo_user_leagues WHERE guid = $1", guid)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var leagueKey string
		if err := rows.Scan(&leagueKey); err != nil {
			continue
		}
		AddSubscriber(a.rdb, ctx, RedisLeagueUsersPrefix+leagueKey, logtoSub)
	}
	return nil
}

// CleanupLeagueSubscribers removes a user from all their league subscriber sets
// and the guid→user mapping. Called during DisconnectYahoo.
func (a *App) CleanupLeagueSubscribers(ctx context.Context, guid, logtoSub string) {
	// Remove guid → logto_sub mapping
	RemoveSubscriber(a.rdb, ctx, RedisGuidUserPrefix+guid, logtoSub)

	// Find all leagues this user belongs to and remove from per-league sets
	rows, err := a.db.Query(ctx,
		"SELECT league_key FROM yahoo_user_leagues WHERE guid = $1", guid)
	if err != nil {
		log.Printf("[CDC Cleanup] Failed to query user leagues for guid=%s: %v", guid, err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var leagueKey string
		if err := rows.Scan(&leagueKey); err != nil {
			continue
		}
		RemoveSubscriber(a.rdb, ctx, RedisLeagueUsersPrefix+leagueKey, logtoSub)
	}
}

// AddLeagueSubscriber adds a single user to a specific league's subscriber set.
// Called after a single league import.
func (a *App) AddLeagueSubscriber(ctx context.Context, leagueKey, logtoSub string) {
	AddSubscriber(a.rdb, ctx, RedisLeagueUsersPrefix+leagueKey, logtoSub)
}

// =============================================================================
// Internal Health Check
// =============================================================================

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}
