package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"

	"github.com/gofiber/fiber/v2"
)

// =============================================================================
// Invite — Super User onboarding flow
// =============================================================================

// CompleteInviteRequest is the request body for POST /invite/complete.
type CompleteInviteRequest struct {
	Email    string `json:"email"`
	Token    string `json:"token"`
	Password string `json:"password"`
	Birthday string `json:"birthday"`
	Gender   string `json:"gender"`
}

const superUserRoleID = "saaf40fy2iaxu1bwhy0m8"

// HandleCompleteInvite verifies an invite token, updates the user's password
// and profile in Logto, then returns success so the frontend can sign them in.
//
// POST /invite/complete (no auth middleware — user isn't logged in yet)
func HandleCompleteInvite(c *fiber.Ctx) error {
	var req CompleteInviteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "Invalid request body"})
	}

	// Validate required fields
	if req.Email == "" || req.Token == "" || req.Password == "" || req.Birthday == "" || req.Gender == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "All fields are required"})
	}
	if len(req.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "Password must be at least 8 characters"})
	}

	// Get M2M token for Logto Management API calls
	m2mToken, err := getM2MToken()
	if err != nil {
		log.Printf("[Invite] Failed to get M2M token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}

	cfg := getM2MConfig()

	// Look up user by email
	userID, username, err := findUserByEmail(cfg.Endpoint, m2mToken, req.Email)
	if err != nil {
		log.Printf("[Invite] User lookup failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{Error: "Invite not found"})
	}

	// Step 3: Verify user has super_user role
	hasSuperUser, err := userHasRole(cfg.Endpoint, m2mToken, userID, superUserRoleID)
	if err != nil {
		log.Printf("[Invite] Role check failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}
	if !hasSuperUser {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{Error: "Not authorized"})
	}

	// Step 4: Update password
	if err := updateUserPassword(cfg.Endpoint, m2mToken, userID, req.Password); err != nil {
		log.Printf("[Invite] Password update failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Failed to set password"})
	}

	// Step 5: Update profile (gender + birthdate are built-in Logto profile fields)
	if err := updateUserProfile(cfg.Endpoint, m2mToken, userID, req.Gender, req.Birthday); err != nil {
		log.Printf("[Invite] Profile update failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Failed to update profile"})
	}

	log.Printf("[Invite] Completed invite for %s (user: %s, username: %s)", req.Email, userID, username)

	return c.JSON(fiber.Map{
		"success":  true,
		"username": username,
	})
}

// ── Logto Management API helpers ────────────────────────────────────

// findUserByEmail searches for a user by primary email and returns (userID, username, error).
func findUserByEmail(endpoint, token, email string) (string, string, error) {
	searchURL := fmt.Sprintf("%s/api/users?search.primaryEmail=%s", endpoint, url.QueryEscape(email))
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", "", fmt.Errorf("create search request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("search request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("search returned %d: %s", resp.StatusCode, string(body))
	}

	var users []struct {
		ID       string  `json:"id"`
		Username *string `json:"username"`
	}
	if err := json.Unmarshal(body, &users); err != nil {
		return "", "", fmt.Errorf("parse search response: %w", err)
	}
	if len(users) == 0 {
		return "", "", fmt.Errorf("no user found with email %s", email)
	}

	username := ""
	if users[0].Username != nil {
		username = *users[0].Username
	}
	return users[0].ID, username, nil
}

// userHasRole checks whether a Logto user has a specific role.
func userHasRole(endpoint, token, userID, roleID string) (bool, error) {
	reqURL := fmt.Sprintf("%s/api/users/%s/roles", endpoint, userID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return false, fmt.Errorf("create roles request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("roles request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("roles returned %d: %s", resp.StatusCode, string(body))
	}

	var roles []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &roles); err != nil {
		return false, fmt.Errorf("parse roles response: %w", err)
	}

	for _, r := range roles {
		if r.ID == roleID {
			return true, nil
		}
	}
	return false, nil
}

// updateUserPassword updates a user's password via Logto Management API.
func updateUserPassword(endpoint, token, userID, password string) error {
	payload, _ := json.Marshal(map[string]string{
		"password": password,
	})

	req, err := http.NewRequest("PATCH", fmt.Sprintf("%s/api/users/%s/password", endpoint, userID), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create password update request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("password update request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("password update returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// updateUserProfile updates a user's gender and birthdate via Logto Management API.
func updateUserProfile(endpoint, token, userID, gender, birthdate string) error {
	payload, _ := json.Marshal(map[string]interface{}{
		"profile": map[string]string{
			"gender":    gender,
			"birthdate": birthdate,
		},
	})

	req, err := http.NewRequest("PATCH", fmt.Sprintf("%s/api/users/%s/profile", endpoint, userID), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create profile update request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("profile update request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("profile update returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
