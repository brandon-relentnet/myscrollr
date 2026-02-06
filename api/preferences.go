package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

// getOrCreatePreferences fetches preferences for a user, creating defaults if none exist.
func getOrCreatePreferences(logtoSub string) (*UserPreferences, error) {
	var prefs UserPreferences
	var activeTabs, enabledSites, disabledSites []byte
	var updatedAt time.Time

	err := dbPool.QueryRow(context.Background(),
		`SELECT logto_sub, feed_mode, feed_position, feed_behavior, feed_enabled,
		        active_tabs, enabled_sites, disabled_sites, updated_at
		 FROM user_preferences WHERE logto_sub = $1`, logtoSub,
	).Scan(
		&prefs.LogtoSub, &prefs.FeedMode, &prefs.FeedPosition, &prefs.FeedBehavior,
		&prefs.FeedEnabled, &activeTabs, &enabledSites, &disabledSites, &updatedAt,
	)

	if err != nil {
		// Row doesn't exist — insert defaults and return them
		var atBytes, esBytes, dsBytes []byte
		var insertedAt time.Time
		err = dbPool.QueryRow(context.Background(),
			`INSERT INTO user_preferences (logto_sub)
			 VALUES ($1)
			 ON CONFLICT (logto_sub) DO UPDATE SET logto_sub = EXCLUDED.logto_sub
			 RETURNING logto_sub, feed_mode, feed_position, feed_behavior, feed_enabled,
			           active_tabs, enabled_sites, disabled_sites, updated_at`,
			logtoSub,
		).Scan(
			&prefs.LogtoSub, &prefs.FeedMode, &prefs.FeedPosition, &prefs.FeedBehavior,
			&prefs.FeedEnabled, &atBytes, &esBytes, &dsBytes, &insertedAt,
		)
		if err != nil {
			return nil, err
		}
		activeTabs = atBytes
		enabledSites = esBytes
		disabledSites = dsBytes
		updatedAt = insertedAt
	}

	// Unmarshal JSONB fields
	if err := json.Unmarshal(activeTabs, &prefs.ActiveTabs); err != nil {
		prefs.ActiveTabs = []string{"finance", "sports"}
	}
	if err := json.Unmarshal(enabledSites, &prefs.EnabledSites); err != nil {
		prefs.EnabledSites = []string{}
	}
	if err := json.Unmarshal(disabledSites, &prefs.DisabledSites); err != nil {
		prefs.DisabledSites = []string{}
	}
	prefs.UpdatedAt = updatedAt.Format(time.RFC3339)

	return &prefs, nil
}

// HandleGetPreferences returns the current user's preferences.
// @Summary Get user preferences
// @Description Fetches extension preferences for the authenticated user
// @Tags Preferences
// @Produce json
// @Success 200 {object} UserPreferences
// @Security LogtoAuth
// @Router /users/me/preferences [get]
func HandleGetPreferences(c *fiber.Ctx) error {
	logtoSub, ok := c.Locals("user_id").(string)
	if !ok || logtoSub == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Missing user identity",
		})
	}

	prefs, err := getOrCreatePreferences(logtoSub)
	if err != nil {
		log.Printf("[Preferences] Error fetching preferences for %s: %v", logtoSub, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch preferences",
		})
	}

	return c.JSON(prefs)
}

// HandleUpdatePreferences performs a partial update of the user's preferences.
// @Summary Update user preferences
// @Description Partially updates extension preferences for the authenticated user
// @Tags Preferences
// @Accept json
// @Produce json
// @Success 200 {object} UserPreferences
// @Security LogtoAuth
// @Router /users/me/preferences [put]
func HandleUpdatePreferences(c *fiber.Ctx) error {
	logtoSub, ok := c.Locals("user_id").(string)
	if !ok || logtoSub == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Missing user identity",
		})
	}

	// Parse partial update body
	var body map[string]interface{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid JSON body",
		})
	}

	// Validate provided fields
	if v, ok := body["feed_mode"]; ok {
		s, isStr := v.(string)
		if !isStr || (s != "comfort" && s != "compact") {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "feed_mode must be 'comfort' or 'compact'",
			})
		}
	}
	if v, ok := body["feed_position"]; ok {
		s, isStr := v.(string)
		if !isStr || (s != "top" && s != "bottom") {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "feed_position must be 'top' or 'bottom'",
			})
		}
	}
	if v, ok := body["feed_behavior"]; ok {
		s, isStr := v.(string)
		if !isStr || (s != "overlay" && s != "push") {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "feed_behavior must be 'overlay' or 'push'",
			})
		}
	}
	if v, ok := body["feed_enabled"]; ok {
		if _, isBool := v.(bool); !isBool {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "feed_enabled must be a boolean",
			})
		}
	}
	if v, ok := body["active_tabs"]; ok {
		arr, isArr := v.([]interface{})
		if !isArr {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "active_tabs must be an array",
			})
		}
		allowed := map[string]bool{"finance": true, "sports": true}
		for _, item := range arr {
			s, isStr := item.(string)
			if !isStr || !allowed[s] {
				return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
					Status: "error",
					Error:  "active_tabs must be a subset of ['finance', 'sports']",
				})
			}
		}
	}
	if v, ok := body["enabled_sites"]; ok {
		if _, isArr := v.([]interface{}); !isArr {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "enabled_sites must be a string array",
			})
		}
	}
	if v, ok := body["disabled_sites"]; ok {
		if _, isArr := v.([]interface{}); !isArr {
			return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "disabled_sites must be a string array",
			})
		}
	}

	// Build the UPSERT query dynamically based on provided fields
	// Start with defaults for all columns, then override with provided values
	// This ensures the row exists after the operation
	query := `
		INSERT INTO user_preferences (logto_sub, feed_mode, feed_position, feed_behavior, feed_enabled, active_tabs, enabled_sites, disabled_sites, updated_at)
		VALUES ($1,
			COALESCE($2, 'comfort'),
			COALESCE($3, 'bottom'),
			COALESCE($4, 'overlay'),
			COALESCE($5, true),
			COALESCE($6, '["finance","sports"]'::jsonb),
			COALESCE($7, '[]'::jsonb),
			COALESCE($8, '[]'::jsonb),
			now()
		)
		ON CONFLICT (logto_sub) DO UPDATE SET
			feed_mode      = COALESCE($2, user_preferences.feed_mode),
			feed_position  = COALESCE($3, user_preferences.feed_position),
			feed_behavior  = COALESCE($4, user_preferences.feed_behavior),
			feed_enabled   = COALESCE($5, user_preferences.feed_enabled),
			active_tabs    = COALESCE($6, user_preferences.active_tabs),
			enabled_sites  = COALESCE($7, user_preferences.enabled_sites),
			disabled_sites = COALESCE($8, user_preferences.disabled_sites),
			updated_at     = now()
		RETURNING logto_sub, feed_mode, feed_position, feed_behavior, feed_enabled,
		          active_tabs, enabled_sites, disabled_sites, updated_at
	`

	// Extract nullable parameters
	var feedMode, feedPosition, feedBehavior *string
	var feedEnabled *bool
	var activeTabsJSON, enabledSitesJSON, disabledSitesJSON []byte

	if v, ok := body["feed_mode"].(string); ok {
		feedMode = &v
	}
	if v, ok := body["feed_position"].(string); ok {
		feedPosition = &v
	}
	if v, ok := body["feed_behavior"].(string); ok {
		feedBehavior = &v
	}
	if v, ok := body["feed_enabled"].(bool); ok {
		feedEnabled = &v
	}
	if v, ok := body["active_tabs"]; ok {
		b, _ := json.Marshal(v)
		activeTabsJSON = b
	}
	if v, ok := body["enabled_sites"]; ok {
		b, _ := json.Marshal(v)
		enabledSitesJSON = b
	}
	if v, ok := body["disabled_sites"]; ok {
		b, _ := json.Marshal(v)
		disabledSitesJSON = b
	}

	var prefs UserPreferences
	var atBytes, esBytes, dsBytes []byte
	var updatedAt time.Time

	err := dbPool.QueryRow(context.Background(), query,
		logtoSub, feedMode, feedPosition, feedBehavior, feedEnabled,
		activeTabsJSON, enabledSitesJSON, disabledSitesJSON,
	).Scan(
		&prefs.LogtoSub, &prefs.FeedMode, &prefs.FeedPosition, &prefs.FeedBehavior,
		&prefs.FeedEnabled, &atBytes, &esBytes, &dsBytes, &updatedAt,
	)
	if err != nil {
		log.Printf("[Preferences] Error updating preferences for %s: %v", logtoSub, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to update preferences",
		})
	}

	// Unmarshal JSONB fields
	if err := json.Unmarshal(atBytes, &prefs.ActiveTabs); err != nil {
		prefs.ActiveTabs = []string{"finance", "sports"}
	}
	if err := json.Unmarshal(esBytes, &prefs.EnabledSites); err != nil {
		prefs.EnabledSites = []string{}
	}
	if err := json.Unmarshal(dsBytes, &prefs.DisabledSites); err != nil {
		prefs.DisabledSites = []string{}
	}
	prefs.UpdatedAt = updatedAt.Format(time.RFC3339)

	return c.JSON(prefs)
}
