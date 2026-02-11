package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

var lifecycleClient = &http.Client{
	Timeout: 10 * time.Second,
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

		// Call integration stream lifecycle hook via HTTP
		callStreamLifecycle(ctx, s.StreamType, "sync", logtoSub, s.Config, nil, &s.Enabled)
	}
}

// addStreamSubscriptions adds Redis subscription entries for a newly created/enabled stream.
func addStreamSubscriptions(ctx context.Context, logtoSub, streamType string, config map[string]interface{}) {
	AddSubscriber(ctx, RedisStreamSubscribersPrefix+streamType, logtoSub)

	enabled := true
	callStreamLifecycle(ctx, streamType, "sync", logtoSub, config, nil, &enabled)
}

// removeStreamSubscriptions removes Redis subscription entries for a deleted/disabled stream.
func removeStreamSubscriptions(ctx context.Context, logtoSub, streamType string, config map[string]interface{}) {
	RemoveSubscriber(ctx, RedisStreamSubscribersPrefix+streamType, logtoSub)

	enabled := false
	callStreamLifecycle(ctx, streamType, "sync", logtoSub, config, nil, &enabled)
}

// callStreamLifecycle sends a lifecycle event to an integration if it has the stream_lifecycle capability.
func callStreamLifecycle(ctx context.Context, streamType, event, userSub string, config, oldConfig map[string]interface{}, enabled *bool) {
	intg := GetIntegration(streamType)
	if intg == nil || !intg.HasCapability("stream_lifecycle") {
		return
	}

	body := map[string]interface{}{
		"event":  event,
		"user":   userSub,
		"config": config,
	}
	if oldConfig != nil {
		body["old_config"] = oldConfig
	}
	if enabled != nil {
		body["enabled"] = *enabled
	}

	reqBody, err := json.Marshal(body)
	if err != nil {
		log.Printf("[Streams] Failed to marshal lifecycle request: %v", err)
		return
	}

	url := intg.InternalURL + "/internal/stream-lifecycle"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		log.Printf("[Streams] Failed to create lifecycle request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := lifecycleClient.Do(req)
	if err != nil {
		log.Printf("[Streams] Lifecycle call to %s/%s failed: %v", intg.Name, event, err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != 200 {
		log.Printf("[Streams] Lifecycle call to %s/%s returned status %d", intg.Name, event, resp.StatusCode)
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

	// Validate stream type against discovered integrations
	validTypes := GetValidStreamTypes()
	if !validTypes[req.StreamType] {
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

	// Call integration OnStreamCreated hook via HTTP
	callStreamLifecycle(ctx, s.StreamType, "created", userID, s.Config, nil, nil)

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
	validTypes := GetValidStreamTypes()
	if !validTypes[streamType] {
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

	// Call integration OnStreamUpdated hook via HTTP
	callStreamLifecycle(ctx, streamType, "updated", userID, s.Config, oldConfig, nil)

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

	// Call integration OnStreamDeleted hook via HTTP
	callStreamLifecycle(ctx, streamType, "deleted", userID, config, nil, nil)

	return c.JSON(fiber.Map{"status": "ok", "message": "Stream removed"})
}
