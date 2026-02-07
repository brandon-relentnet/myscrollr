package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v2"
)

// validStreamTypes defines the allowed stream types.
var validStreamTypes = map[string]bool{
	"finance": true,
	"sports":  true,
	"fantasy": true,
	"rss":     true,
}

// getUserStreams fetches all streams for a user.
func getUserStreams(logtoSub string) ([]Stream, error) {
	rows, err := dbPool.Query(context.Background(), `
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

// syncStreamSubscriptions rebuilds Redis subscription sets for a user from their
// current streams in the database. This ensures Redis is warm even after restart.
// Called on dashboard load and after stream CRUD operations.
func syncStreamSubscriptions(logtoSub string) {
	streams, err := getUserStreams(logtoSub)
	if err != nil {
		log.Printf("[Streams] Failed to sync subscriptions for %s: %v", logtoSub, err)
		return
	}

	ctx := context.Background()
	for _, s := range streams {
		setKey := "stream:subscribers:" + s.StreamType
		if s.Enabled {
			AddSubscriber(ctx, setKey, logtoSub)
		} else {
			RemoveSubscriber(ctx, setKey, logtoSub)
		}

		// For RSS streams, also maintain per-feed-URL sets
		if s.StreamType == "rss" && s.Enabled {
			feedURLs := extractFeedURLsFromStreamConfig(s.Config)
			for _, url := range feedURLs {
				AddSubscriber(ctx, "rss:subscribers:"+url, logtoSub)
			}
		}
	}
}

// extractFeedURLsFromStreamConfig extracts feed URLs from a stream's config map.
func extractFeedURLsFromStreamConfig(config map[string]interface{}) []string {
	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil
	}
	return extractFeedURLsFromConfig(configJSON)
}

// addStreamSubscriptions adds Redis subscription entries for a newly created/enabled stream.
func addStreamSubscriptions(ctx context.Context, logtoSub, streamType string, config map[string]interface{}) {
	AddSubscriber(ctx, "stream:subscribers:"+streamType, logtoSub)
	if streamType == "rss" {
		feedURLs := extractFeedURLsFromStreamConfig(config)
		for _, url := range feedURLs {
			AddSubscriber(ctx, "rss:subscribers:"+url, logtoSub)
		}
	}
}

// removeStreamSubscriptions removes Redis subscription entries for a deleted/disabled stream.
func removeStreamSubscriptions(ctx context.Context, logtoSub, streamType string, config map[string]interface{}) {
	RemoveSubscriber(ctx, "stream:subscribers:"+streamType, logtoSub)
	if streamType == "rss" {
		feedURLs := extractFeedURLsFromStreamConfig(config)
		for _, url := range feedURLs {
			RemoveSubscriber(ctx, "rss:subscribers:"+url, logtoSub)
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
	userID := getUserID(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	streams, err := getUserStreams(userID)
	if err != nil {
		log.Printf("[Streams] Error fetching streams: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
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
	userID := getUserID(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	var req struct {
		StreamType string                 `json:"stream_type"`
		Config     map[string]interface{} `json:"config"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	if !validStreamTypes[req.StreamType] {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid stream type. Must be one of: finance, sports, fantasy, rss",
		})
	}

	if req.Config == nil {
		req.Config = map[string]interface{}{}
	}

	configJSON, _ := json.Marshal(req.Config)

	var s Stream
	var configBytes []byte
	err := dbPool.QueryRow(context.Background(), `
		INSERT INTO user_streams (logto_sub, stream_type, config)
		VALUES ($1, $2, $3)
		RETURNING id, logto_sub, stream_type, enabled, visible, config, created_at, updated_at
	`, userID, req.StreamType, configJSON).Scan(
		&s.ID, &s.LogtoSub, &s.StreamType, &s.Enabled, &s.Visible,
		&configBytes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if contains(err.Error(), "unique") || contains(err.Error(), "duplicate") {
			return c.Status(http.StatusConflict).JSON(ErrorResponse{
				Status: "error",
				Error:  "Stream of this type already exists",
			})
		}
		log.Printf("[Streams] Create error: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
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

	return c.Status(http.StatusCreated).JSON(s)
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
	userID := getUserID(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	streamType := c.Params("type")
	if !validStreamTypes[streamType] {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
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
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
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
	`, joinStrings(setClauses, ", "))

	var s Stream
	var configBytes []byte
	err := dbPool.QueryRow(context.Background(), query, args...).Scan(
		&s.ID, &s.LogtoSub, &s.StreamType, &s.Enabled, &s.Visible,
		&configBytes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		errStr := err.Error()
		if contains(errStr, "no rows") {
			return c.Status(http.StatusNotFound).JSON(ErrorResponse{
				Status: "error",
				Error:  "Stream not found",
			})
		}
		log.Printf("[Streams] Update error: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
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

	// If this was an RSS stream config update, sync feed URLs to tracked_feeds
	if streamType == "rss" && req.Config != nil {
		go syncRSSFeedsToTracked(s.Config)
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
	userID := getUserID(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	streamType := c.Params("type")

	// Fetch the stream config before deleting (needed to clean up RSS subscriber sets)
	var configBytes []byte
	_ = dbPool.QueryRow(context.Background(), `
		SELECT config FROM user_streams WHERE logto_sub = $1 AND stream_type = $2
	`, userID, streamType).Scan(&configBytes)

	tag, err := dbPool.Exec(context.Background(), `
		DELETE FROM user_streams WHERE logto_sub = $1 AND stream_type = $2
	`, userID, streamType)
	if err != nil {
		log.Printf("[Streams] Delete error: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete stream",
		})
	}

	if tag.RowsAffected() == 0 {
		return c.Status(http.StatusNotFound).JSON(ErrorResponse{
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

	return c.JSON(fiber.Map{"status": "ok", "message": "Stream removed"})
}

// joinStrings joins a slice of strings with a separator.
func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}
