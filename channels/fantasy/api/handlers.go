package main

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

// InternalHealthTimeout is the aggregate timeout for a /internal/health
// request, covering DB and Redis pings. Shorter than the k8s readiness
// probe timeout so a slow downstream doesn't hold up the probe.
const InternalHealthTimeout = 3 * time.Second

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

// PopulateLeagueSubscribers adds a user to all their league subscriber sets.
// Called after OAuth link succeeds to restore CDC subscriptions on reconnect.
func (a *App) PopulateLeagueSubscribers(ctx context.Context, guid, logtoSub string) error {
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

// CleanupLeagueSubscribers removes a user from all their league subscriber sets.
// Called during DisconnectYahoo.
func (a *App) CleanupLeagueSubscribers(ctx context.Context, guid, logtoSub string) {
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

// handleInternalHealth is the endpoint the core gateway and k8s probes hit.
//
// It verifies that this API's own dependencies (Postgres, Redis) are
// reachable and that the Yahoo sync loop has not exhausted its restart
// budget. Any failure returns HTTP 503 so the k8s readinessProbe marks the
// pod NotReady. Previously returned a static `{"status":"healthy"}` no
// matter what, which meant a dead sync loop was invisible to Kubernetes
// and the service kept receiving traffic it couldn't serve.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), InternalHealthTimeout)
	defer cancel()

	result := fiber.Map{"status": "healthy"}
	degraded := false

	if err := a.db.Ping(ctx); err != nil {
		result["database"] = "unhealthy: " + err.Error()
		degraded = true
	} else {
		result["database"] = "healthy"
	}

	if err := a.rdb.Ping(ctx).Err(); err != nil {
		result["redis"] = "unhealthy: " + err.Error()
		degraded = true
	} else {
		result["redis"] = "healthy"
	}

	// Sync-exhausted is a readiness failure: the pod is nominally alive,
	// but no new Yahoo data will ever be written to Postgres. A restart
	// is cheap and may clear a transient upstream error; if not, the
	// sync will fail again and the pod will stay NotReady.
	if a.syncState != nil && a.syncState.IsFailed() {
		result["sync"] = "failed: exceeded max restarts"
		degraded = true
	} else if a.syncState != nil {
		result["sync"] = "running"
	}

	if degraded {
		result["status"] = "degraded"
		return c.Status(fiber.StatusServiceUnavailable).JSON(result)
	}
	return c.JSON(result)
}
