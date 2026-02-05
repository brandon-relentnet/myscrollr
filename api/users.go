package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v2"
)

// YahooStatusResponse returns whether user has Yahoo connected
type YahooStatusResponse struct {
	Connected bool `json:"connected"`
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
		SELECT last_sync FROM yahoo_users WHERE guid = $1
	`, userID).Scan(&lastSync)

	if err != nil && err != sql.ErrNoRows && !contains(err.Error(), "no rows") {
		log.Printf("[GetYahooStatus] Error: %v", err)
		return c.Status(http.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to check Yahoo status",
		})
	}

	return c.JSON(YahooStatusResponse{
		Connected: lastSync.Valid,
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
