package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Profile represents a user profile
type Profile struct {
	UserID      string    `json:"user_id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name,omitempty"`
	Bio         string    `json:"bio,omitempty"`
	IsPublic    bool      `json:"is_public"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ProfileResponse is the public profile response
type ProfileResponse struct {
	Username       string `json:"username"`
	DisplayName    string `json:"display_name,omitempty"`
	Bio            string `json:"bio,omitempty"`
	IsPublic       bool   `json:"is_public"`
	ConnectedYahoo bool   `json:"connected_yahoo"`
}

// FullProfileResponse includes private info for the owner
type FullProfileResponse struct {
	Username       string     `json:"username"`
	DisplayName    string     `json:"display_name,omitempty"`
	Bio            string     `json:"bio,omitempty"`
	IsPublic       bool       `json:"is_public"`
	ConnectedYahoo bool       `json:"connected_yahoo"`
	LastSync       *time.Time `json:"last_sync,omitempty"`
}

// UpdateProfileRequest is the request body for updating profile
type UpdateProfileRequest struct {
	DisplayName string `json:"display_name,omitempty"`
	Bio         string `json:"bio,omitempty"`
	IsPublic    *bool  `json:"is_public,omitempty"`
}

// GetProfileByUsername retrieves a public profile by username
func GetProfileByUsername(c *fiber.Ctx) error {
	username := c.Params("username")
	if username == "" {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username is required",
		})
	}

	// Validate username format
	if len(username) < 3 || len(username) > 30 {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username must be between 3 and 30 characters",
		})
	}
	if !isValidUsername(username) {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username can only contain letters, numbers, and underscores",
		})
	}

	var profile Profile
	err := dbPool.QueryRow(context.Background(), `
		SELECT user_id, username, display_name, bio, is_public, created_at, updated_at
		FROM profiles
		WHERE username = $1
	`, username).Scan(
		&profile.UserID,
		&profile.Username,
		&profile.DisplayName,
		&profile.Bio,
		&profile.IsPublic,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return c.Status(http.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Profile not found",
		})
	}
	if err != nil {
		log.Printf("Error fetching profile: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch profile",
		})
	}

	// Check if profile is private
	if !profile.IsPublic {
		// Get current user ID from auth
		currentUserID := getLogtoUserId(c)
		if currentUserID != profile.UserID {
			return c.Status(http.StatusForbidden).JSON(ErrorResponse{
				Status: "error",
				Error:  "This profile is private",
			})
		}
	}

	// Check if Yahoo is connected
	connectedYahoo := false
	var lastSync sql.NullTime
	err = dbPool.QueryRow(context.Background(), `
		SELECT last_sync FROM yahoo_users WHERE guid = $1
	`, profile.UserID).Scan(&lastSync)
	if err == nil && lastSync.Valid {
		connectedYahoo = true
	}

	response := ProfileResponse{
		Username:       profile.Username,
		DisplayName:    profile.DisplayName,
		Bio:            profile.Bio,
		IsPublic:       profile.IsPublic,
		ConnectedYahoo: connectedYahoo,
	}

	return c.JSON(response)
}

// GetMyProfile returns the current user's full profile
func GetMyProfile(c *fiber.Ctx) error {
	userID := getLogtoUserId(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	// First check if profile exists
	var profile Profile
	err := dbPool.QueryRow(context.Background(), `
		SELECT user_id, username, display_name, bio, is_public, created_at, updated_at
		FROM profiles
		WHERE user_id = $1
	`, userID).Scan(
		&profile.UserID,
		&profile.Username,
		&profile.DisplayName,
		&profile.Bio,
		&profile.IsPublic,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)

	// If no profile exists, create a placeholder one
	if err == sql.ErrNoRows {
		// Get email from JWT claims
		email := getLogtoEmail(c)

		// Generate initial username from email (before @)
		initialUsername := ""
		if email != "" {
			parts := strings.Split(email, "@")
			if len(parts) > 0 {
				initialUsername = parts[0]
			}
		}

		// Check if this username is available
		var count int
		err = dbPool.QueryRow(context.Background(), `
			SELECT COUNT(*) FROM profiles WHERE username = $1
		`, initialUsername).Scan(&count)

		// If email-based username exists, append a random suffix
		if err == nil && count > 0 {
			initialUsername = initialUsername + fmt.Sprintf("%d", time.Now().Unix()%10000)
		}

		// Create profile
		_, err = dbPool.Exec(context.Background(), `
			INSERT INTO profiles (user_id, username, display_name, is_public, created_at, updated_at)
			VALUES ($1, $2, $3, true, NOW(), NOW())
		`, userID, initialUsername, initialUsername)

		if err != nil {
			log.Printf("Error creating profile: %v", err)
			return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
				Status: "error",
				Error:  "Failed to create profile",
			})
		}

		profile = Profile{
			UserID:      userID,
			Username:    initialUsername,
			DisplayName: initialUsername,
			IsPublic:    true,
		}
	} else if err != nil {
		log.Printf("Error fetching profile: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch profile",
		})
	}

	// Check if Yahoo is connected
	connectedYahoo := false
	var lastSync sql.NullTime
	err = dbPool.QueryRow(context.Background(), `
		SELECT last_sync FROM yahoo_users WHERE guid = $1
	`, userID).Scan(&lastSync)
	if err == nil && lastSync.Valid {
		connectedYahoo = true
	}

	response := FullProfileResponse{
		Username:       profile.Username,
		DisplayName:    profile.DisplayName,
		Bio:            profile.Bio,
		IsPublic:       profile.IsPublic,
		ConnectedYahoo: connectedYahoo,
		LastSync:       nil,
	}
	if lastSync.Valid {
		response.LastSync = &lastSync.Time
	}

	return c.JSON(response)
}

// UpdateMyProfile updates the current user's profile
func UpdateMyProfile(c *fiber.Ctx) error {
	userID := getLogtoUserId(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	var req UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	// Build update query dynamically
	updates := []string{}
	args := []interface{}{}
	argNum := 1

	if req.DisplayName != "" {
		if len(req.DisplayName) > 100 {
			return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "Display name must be 100 characters or less",
			})
		}
		updates = append(updates, fmt.Sprintf("display_name = $%d", argNum))
		args = append(args, req.DisplayName)
		argNum++
	}

	if req.Bio != "" {
		if len(req.Bio) > 500 {
			return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
				Status: "error",
				Error:  "Bio must be 500 characters or less",
			})
		}
		updates = append(updates, fmt.Sprintf("bio = $%d", argNum))
		args = append(args, req.Bio)
		argNum++
	}

	if req.IsPublic != nil {
		updates = append(updates, fmt.Sprintf("is_public = $%d", argNum))
		args = append(args, *req.IsPublic)
		argNum++
	}

	if len(updates) == 0 {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "No fields to update",
		})
	}

	updates = append(updates, "updated_at = NOW()")
	args = append(args, userID)

	query := fmt.Sprintf(`
		UPDATE profiles SET %s WHERE user_id = $%d
	`, strings.Join(updates, ", "), argNum)

	_, err := dbPool.Exec(context.Background(), query, args...)
	if err != nil {
		log.Printf("Error updating profile: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to update profile",
		})
	}

	return c.JSON(ErrorResponse{
		Status: "success",
	})
}

// SetUsername sets the username for the current user (can only be done once)
func SetUsername(c *fiber.Ctx) error {
	userID := getLogtoUserId(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	var req struct {
		Username string `json:"username"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	// Validate username
	if len(req.Username) < 3 || len(req.Username) > 30 {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username must be between 3 and 30 characters",
		})
	}
	if !isValidUsername(req.Username) {
		return c.Status(http.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username can only contain letters, numbers, and underscores",
		})
	}

	// Check if username already exists
	var count int
	err := dbPool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM profiles WHERE username = $1 AND user_id != $2
	`, req.Username, userID).Scan(&count)
	if err != nil {
		log.Printf("Error checking username: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to check username availability",
		})
	}
	if count > 0 {
		return c.Status(http.StatusConflict).JSON(ErrorResponse{
			Status: "error",
			Error:  "Username is already taken",
		})
	}

	// Check if user already has a username
	var existingCount int
	err = dbPool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM profiles WHERE user_id = $1
	`, userID).Scan(&existingCount)
	if err != nil {
		log.Printf("Error checking existing profile: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to check profile",
		})
	}

	if existingCount == 0 {
		// Create new profile with username
		_, err = dbPool.Exec(context.Background(), `
			INSERT INTO profiles (user_id, username, display_name, is_public, created_at, updated_at)
			VALUES ($1, $2, $3, true, NOW(), NOW())
		`, userID, req.Username, req.Username)
	} else {
		// Update existing profile
		_, err = dbPool.Exec(context.Background(), `
			UPDATE profiles SET username = $1, display_name = COALESCE(NULLIF(display_name, ''), $1), updated_at = NOW()
			WHERE user_id = $2
		`, req.Username, userID)
	}

	if err != nil {
		log.Printf("Error setting username: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to set username",
		})
	}

	return c.JSON(ErrorResponse{
		Status: "success",
	})
}

// DisconnectYahoo removes Yahoo connection for the current user
func DisconnectYahoo(c *fiber.Ctx) error {
	userID := getLogtoUserId(c)
	if userID == "" {
		return c.Status(http.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	// Delete Yahoo user
	_, err := dbPool.Exec(context.Background(), `
		DELETE FROM yahoo_users WHERE guid = $1
	`, userID)
	if err != nil {
		log.Printf("Error disconnecting Yahoo: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to disconnect Yahoo",
		})
	}

	return c.JSON(ErrorResponse{
		Status: "success",
	})
}

// isValidUsername checks if a username is valid
func isValidUsername(username string) bool {
	for _, c := range username {
		if !((c >= 'a' && c <= 'z') ||
			(c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') ||
			c == '_') {
			return false
		}
	}
	return true
}
