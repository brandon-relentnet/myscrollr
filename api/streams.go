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

// defaultStreams are created automatically for new users.
var defaultStreams = []struct {
	StreamType string
	Config     map[string]interface{}
}{
	{
		StreamType: "finance",
		Config:     map[string]interface{}{},
	},
	{
		StreamType: "sports",
		Config:     map[string]interface{}{},
	},
}

// seedDefaultStreams creates the default streams for a new user.
func seedDefaultStreams(logtoSub string) ([]Stream, error) {
	streams := make([]Stream, 0, len(defaultStreams))

	for _, ds := range defaultStreams {
		configJSON, _ := json.Marshal(ds.Config)

		var s Stream
		err := dbPool.QueryRow(context.Background(), `
			INSERT INTO user_streams (logto_sub, stream_type, enabled, visible, config)
			VALUES ($1, $2, true, true, $3)
			ON CONFLICT (logto_sub, stream_type) DO NOTHING
			RETURNING id, logto_sub, stream_type, enabled, visible, config, created_at, updated_at
		`, logtoSub, ds.StreamType, configJSON).Scan(
			&s.ID, &s.LogtoSub, &s.StreamType, &s.Enabled, &s.Visible,
			&configJSON, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			// ON CONFLICT DO NOTHING means no row returned — stream already exists.
			// This is fine, we'll fetch all streams below.
			continue
		}
		if err := json.Unmarshal(configJSON, &s.Config); err != nil {
			s.Config = map[string]interface{}{}
		}
		streams = append(streams, s)
	}

	// If some already existed, fetch all streams for the user.
	if len(streams) < len(defaultStreams) {
		return getUserStreams(logtoSub)
	}

	return streams, nil
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

// GetStreams returns all streams for the authenticated user.
// If the user has no streams, default streams are seeded.
//
// @Summary Get user streams
// @Description Returns all active streams for the authenticated user, auto-seeding defaults if empty
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

	// Auto-seed defaults for new users
	if len(streams) == 0 {
		streams, err = seedDefaultStreams(userID)
		if err != nil {
			log.Printf("[Streams] Error seeding defaults: %v", err)
			return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
				Status: "error",
				Error:  "Failed to initialize streams",
			})
		}
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
