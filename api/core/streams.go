package core

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
)

// IntegrationRegistry holds the registered integrations. Set by server.go
// during startup so stream CRUD and sync can call integration hooks.
var IntegrationRegistry []integration.Integration

// ValidStreamTypes is built from the registered integrations at startup.
var ValidStreamTypes map[string]bool

// BuildValidStreamTypes populates ValidStreamTypes from the registry.
func BuildValidStreamTypes() {
	ValidStreamTypes = make(map[string]bool, len(IntegrationRegistry))
	for _, intg := range IntegrationRegistry {
		ValidStreamTypes[intg.Name()] = true
	}
}

// findIntegration returns the integration matching the given stream type, or nil.
func findIntegration(streamType string) integration.Integration {
	for _, intg := range IntegrationRegistry {
		if intg.Name() == streamType {
			return intg
		}
	}
	return nil
}

// GetUserStreams fetches all streams for a user.
func GetUserStreams(logtoSub string) ([]Stream, error) {
	rows, err := DBPool.Query(context.Background(), `
		SELECT id, logto_sub, stream_type, enabled, visible, config, created_at, updated_at
		FROM user_streams
		WHERE logto_sub = $1
		ORDER BY created_at ASC
	`, logtoSub)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	streams := make([]Stream, 0)
	for rows.Next() {
		var s Stream
		var configJSON []byte
		if err := rows.Scan(&s.ID, &s.LogtoSub, &s.StreamType, &s.Enabled, &s.Visible, &configJSON, &s.CreatedAt, &s.UpdatedAt); err != nil {
			log.Printf("[Streams] Scan error: %v", err)
			continue
		}
		if err := json.Unmarshal(configJSON, &s.Config); err != nil {
			s.Config = map[string]interface{}{}
		}
		streams = append(streams, s)
	}

	return streams, nil
}

// SyncStreamSubscriptions rebuilds Redis subscription sets for a user from their
// current streams in the database. Called on dashboard load and after stream CRUD.
func SyncStreamSubscriptions(logtoSub string) {
	streams, err := GetUserStreams(logtoSub)
	if err != nil {
		log.Printf("[Streams] Failed to sync subscriptions for %s: %v", logtoSub, err)
		return
	}

	ctx := context.Background()
	for _, s := range streams {
		setKey := RedisStreamSubscribersPrefix + s.StreamType
		if s.Enabled {
			AddSubscriber(ctx, setKey, logtoSub)
		} else {
			RemoveSubscriber(ctx, setKey, logtoSub)
		}

		// Call integration-specific sync hook (only if it implements StreamLifecycle)
		intg := findIntegration(s.StreamType)
		if sl, ok := intg.(integration.StreamLifecycle); ok {
			if err := sl.OnSyncSubscriptions(ctx, logtoSub, s.Config, s.Enabled); err != nil {
				log.Printf("[Streams] OnSyncSubscriptions error for %s/%s: %v", s.StreamType, logtoSub, err)
			}
		}
	}
}

// addStreamSubscriptions adds Redis subscription entries for a newly created/enabled stream.
func addStreamSubscriptions(ctx context.Context, logtoSub, streamType string, config map[string]interface{}) {
	AddSubscriber(ctx, RedisStreamSubscribersPrefix+streamType, logtoSub)

	// Call integration-specific hook (only if it implements StreamLifecycle)
	intg := findIntegration(streamType)
	if sl, ok := intg.(integration.StreamLifecycle); ok {
		if err := sl.OnSyncSubscriptions(ctx, logtoSub, config, true); err != nil {
			log.Printf("[Streams] addStreamSubscriptions hook error for %s: %v", streamType, err)
		}
	}
}

// removeStreamSubscriptions removes Redis subscription entries for a deleted/disabled stream.
func removeStreamSubscriptions(ctx context.Context, logtoSub, streamType string, config map[string]interface{}) {
	RemoveSubscriber(ctx, RedisStreamSubscribersPrefix+streamType, logtoSub)

	// Call integration-specific hook (only if it implements StreamLifecycle)
	intg := findIntegration(streamType)
	if sl, ok := intg.(integration.StreamLifecycle); ok {
		if err := sl.OnSyncSubscriptions(ctx, logtoSub, config, false); err != nil {
			log.Printf("[Streams] removeStreamSubscriptions hook error for %s: %v", streamType, err)
		}
	}
}

// GetStreams returns all streams for the authenticated user.
//
// @Summary Get user streams
// @Description Returns all active streams for the authenticated user
// @Tags Streams
// @Produce json
// @Success 200 {object} object{streams=[]Stream}
// @Security LogtoAuth
// @Router /users/me/streams [get]
func GetStreams(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	streams, err := GetUserStreams(userID)
	if err != nil {
		log.Printf("[Streams] Error fetching streams: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch streams",
		})
	}

	return c.JSON(fiber.Map{"streams": streams})
}

// CreateStream adds a new stream for the authenticated user.
//
// @Summary Create a stream
// @Description Add a new integration stream for the authenticated user
// @Tags Streams
// @Accept json
// @Produce json
// @Param body body object true "Stream creation request" example({"stream_type":"rss","config":{}})
// @Success 201 {object} Stream
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Security LogtoAuth
// @Router /users/me/streams [post]
func CreateStream(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var req struct {
		StreamType string                 `json:"stream_type"`
		Config     map[string]interface{} `json:"config"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	if !ValidStreamTypes[req.StreamType] {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid stream type",
		})
	}

	if req.Config == nil {
		req.Config = map[string]interface{}{}
	}

	configJSON, _ := json.Marshal(req.Config)

	var s Stream
	var configBytes []byte
	err := DBPool.QueryRow(context.Background(), `
		INSERT INTO user_streams (logto_sub, stream_type, config)
		VALUES ($1, $2, $3)
		RETURNING id, logto_sub, stream_type, enabled, visible, config, created_at, updated_at
	`, userID, req.StreamType, configJSON).Scan(
		&s.ID, &s.LogtoSub, &s.StreamType, &s.Enabled, &s.Visible,
		&configBytes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Status: "error",
				Error:  "Stream of this type already exists",
			})
		}
		log.Printf("[Streams] Create error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to create stream",
		})
	}

	if err := json.Unmarshal(configBytes, &s.Config); err != nil {
		s.Config = map[string]interface{}{}
	}

	// Maintain Redis subscription sets
	ctx := context.Background()
	if s.Enabled {
		addStreamSubscriptions(ctx, userID, s.StreamType, s.Config)
	}

	// Call integration OnStreamCreated hook (only if it implements StreamLifecycle)
	intg := findIntegration(s.StreamType)
	if sl, ok := intg.(integration.StreamLifecycle); ok {
		if err := sl.OnStreamCreated(ctx, userID, s.Config); err != nil {
			log.Printf("[Streams] OnStreamCreated error for %s: %v", s.StreamType, err)
		}
	}

	return c.Status(fiber.StatusCreated).JSON(s)
}

// UpdateStream updates a stream by type for the authenticated user.
//
// @Summary Update a stream
// @Description Update stream settings (enabled, visible, config) by stream type
// @Tags Streams
// @Accept json
// @Produce json
// @Param type path string true "Stream type (finance, sports, fantasy, rss)"
// @Param body body object true "Stream update request"
// @Success 200 {object} Stream
// @Failure 404 {object} ErrorResponse
// @Security LogtoAuth
// @Router /users/me/streams/{type} [put]
func UpdateStream(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	streamType := c.Params("type")
	if !ValidStreamTypes[streamType] {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid stream type",
		})
	}

	var req struct {
		Enabled *bool                  `json:"enabled"`
		Visible *bool                  `json:"visible"`
		Config  map[string]interface{} `json:"config"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	// Fetch old config before UPDATE so integrations can diff
	var oldConfig map[string]interface{}
	if req.Config != nil {
		var oldConfigBytes []byte
		_ = DBPool.QueryRow(context.Background(), `
			SELECT config FROM user_streams WHERE logto_sub = $1 AND stream_type = $2
		`, userID, streamType).Scan(&oldConfigBytes)
		if len(oldConfigBytes) > 0 {
			json.Unmarshal(oldConfigBytes, &oldConfig)
		}
	}

	// Build dynamic UPDATE query
	setClauses := []string{"updated_at = now()"}
	args := []interface{}{userID, streamType}
	argIdx := 3

	if req.Enabled != nil {
		setClauses = append(setClauses, fmt.Sprintf("enabled = $%d", argIdx))
		args = append(args, *req.Enabled)
		argIdx++
	}
	if req.Visible != nil {
		setClauses = append(setClauses, fmt.Sprintf("visible = $%d", argIdx))
		args = append(args, *req.Visible)
		argIdx++
	}
	if req.Config != nil {
		configJSON, _ := json.Marshal(req.Config)
		setClauses = append(setClauses, fmt.Sprintf("config = $%d", argIdx))
		args = append(args, configJSON)
		argIdx++
	}

	query := fmt.Sprintf(`
		UPDATE user_streams
		SET %s
		WHERE logto_sub = $1 AND stream_type = $2
		RETURNING id, logto_sub, stream_type, enabled, visible, config, created_at, updated_at
	`, strings.Join(setClauses, ", "))

	var s Stream
	var configBytes []byte
	err := DBPool.QueryRow(context.Background(), query, args...).Scan(
		&s.ID, &s.LogtoSub, &s.StreamType, &s.Enabled, &s.Visible,
		&configBytes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		errStr := err.Error()
		if strings.Contains(errStr, "no rows") {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Status: "error",
				Error:  "Stream not found",
			})
		}
		log.Printf("[Streams] Update error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to update stream",
		})
	}

	if err := json.Unmarshal(configBytes, &s.Config); err != nil {
		s.Config = map[string]interface{}{}
	}

	// Maintain Redis subscription sets based on new enabled state
	ctx := context.Background()
	if s.Enabled {
		addStreamSubscriptions(ctx, userID, s.StreamType, s.Config)
	} else {
		removeStreamSubscriptions(ctx, userID, s.StreamType, s.Config)
	}

	// Call integration OnStreamUpdated hook (only if it implements StreamLifecycle)
	intg := findIntegration(streamType)
	if sl, ok := intg.(integration.StreamLifecycle); ok {
		if err := sl.OnStreamUpdated(ctx, userID, oldConfig, s.Config); err != nil {
			log.Printf("[Streams] OnStreamUpdated error for %s: %v", streamType, err)
		}
	}

	return c.JSON(s)
}

// DeleteStream removes a stream by type for the authenticated user.
//
// @Summary Delete a stream
// @Description Remove a stream by type
// @Tags Streams
// @Produce json
// @Param type path string true "Stream type"
// @Success 200 {object} object{status=string,message=string}
// @Failure 404 {object} ErrorResponse
// @Security LogtoAuth
// @Router /users/me/streams/{type} [delete]
func DeleteStream(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	streamType := c.Params("type")

	// Fetch the stream config before deleting (needed for integration cleanup hooks)
	var configBytes []byte
	_ = DBPool.QueryRow(context.Background(), `
		SELECT config FROM user_streams WHERE logto_sub = $1 AND stream_type = $2
	`, userID, streamType).Scan(&configBytes)

	tag, err := DBPool.Exec(context.Background(), `
		DELETE FROM user_streams WHERE logto_sub = $1 AND stream_type = $2
	`, userID, streamType)
	if err != nil {
		log.Printf("[Streams] Delete error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete stream",
		})
	}

	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Stream not found",
		})
	}

	// Clean up Redis subscription sets
	ctx := context.Background()
	var config map[string]interface{}
	if len(configBytes) > 0 {
		json.Unmarshal(configBytes, &config)
	}
	if config == nil {
		config = map[string]interface{}{}
	}
	removeStreamSubscriptions(ctx, userID, streamType, config)

	// Call integration OnStreamDeleted hook (only if it implements StreamLifecycle)
	intg := findIntegration(streamType)
	if sl, ok := intg.(integration.StreamLifecycle); ok {
		if err := sl.OnStreamDeleted(ctx, userID, config); err != nil {
			log.Printf("[Streams] OnStreamDeleted error for %s: %v", streamType, err)
		}
	}

	return c.JSON(fiber.Map{"status": "ok", "message": "Stream removed"})
}
