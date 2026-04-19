package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"

	"github.com/gofiber/fiber/v2"
)

// =============================================================================
// Invite — Super User onboarding flow
// =============================================================================

// CompleteInviteRequest is the request body for POST /invite/complete.
type CompleteInviteRequest struct {
	Email     string `json:"email"`
	Token     string `json:"token"`
	Password  string `json:"password"`
	Birthday  string `json:"birthday"`
	Gender    string `json:"gender"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

const superUserRoleID = "saaf40fy2iaxu1bwhy0m8"

var usernameRegex = regexp.MustCompile(`^[a-z0-9_]{3,24}$`)

// HandleCompleteInvite verifies an invite token, updates the user's password,
// profile, username, and display name in Logto, then returns success.
//
// POST /invite/complete (no auth middleware — user isn't logged in yet)
func HandleCompleteInvite(c *fiber.Ctx) error {
	var req CompleteInviteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "Invalid request body"})
	}

	// Validate required fields
	if req.Email == "" || req.Token == "" || req.Password == "" || req.Birthday == "" || req.Gender == "" || req.Username == "" || req.FirstName == "" || req.LastName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "All fields are required"})
	}
	if len(req.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "Password must be at least 8 characters"})
	}
	if !usernameRegex.MatchString(req.Username) {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "Username must be 3-24 characters, lowercase letters, digits, or underscores"})
	}

	m2mToken, err := getM2MToken()
	if err != nil {
		log.Printf("[Invite] Failed to get M2M token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}

	cfg := getM2MConfig()

	// Server-side one-time token verification. This is the ONLY
	// authorization gate that proves the caller actually received the
	// emailed invite link for this address. The token is consumed by
	// Logto on success — the frontend must sign the user in with their
	// newly-set password afterward, NOT with signIn({one_time_token}).
	if err := verifyOneTimeToken(cfg.Endpoint, m2mToken, req.Email, req.Token); err != nil {
		log.Printf("[Invite] Token verification failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error: "Invite link is invalid or has expired",
		})
	}

	userID, _, err := findUserByEmail(cfg.Endpoint, m2mToken, req.Email)
	if err != nil {
		log.Printf("[Invite] User lookup failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{Error: "Invite not found"})
	}

	hasSuperUser, err := userHasRole(cfg.Endpoint, m2mToken, userID, superUserRoleID)
	if err != nil {
		log.Printf("[Invite] Role check failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}
	if !hasSuperUser {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{Error: "Not authorized"})
	}

	available, err := checkUsernameAvailable(cfg.Endpoint, m2mToken, req.Username)
	if err != nil {
		log.Printf("[Invite] Username check failed for %s: %v", req.Username, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}
	if !available {
		return c.Status(fiber.StatusConflict).JSON(ErrorResponse{Error: "Username was taken, please choose another"})
	}

	if err := updateUserPassword(cfg.Endpoint, m2mToken, userID, req.Password); err != nil {
		log.Printf("[Invite] Password update failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Failed to set password"})
	}

	if err := updateUserProfile(cfg.Endpoint, m2mToken, userID, req.Gender, req.Birthday, req.FirstName, req.LastName); err != nil {
		log.Printf("[Invite] Profile update failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Failed to update profile"})
	}

	displayName := req.FirstName + " " + req.LastName
	if err := updateUserIdentity(cfg.Endpoint, m2mToken, userID, req.Username, displayName); err != nil {
		if err.Error() == "username_taken" {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{Error: "Username was taken, please choose another"})
		}
		log.Printf("[Invite] Identity update failed for %s: %v", req.Email, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Failed to set username"})
	}

	log.Printf("[Invite] Completed invite for %s (user: %s, username: %s)", req.Email, userID, req.Username)

	return c.JSON(fiber.Map{
		"success":  true,
		"username": req.Username,
	})
}

// HandleCheckUsernameAvailable checks if a username is available.
// GET /invite/username-available?email=X&username=Y (no auth — verified via email+role)
func HandleCheckUsernameAvailable(c *fiber.Ctx) error {
	email := c.Query("email")
	username := c.Query("username")

	if email == "" || username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Error: "email and username are required"})
	}

	if !usernameRegex.MatchString(username) {
		return c.JSON(fiber.Map{
			"available": false,
			"reason":    "invalid",
		})
	}

	m2mToken, err := getM2MToken()
	if err != nil {
		log.Printf("[Invite] Username check: M2M token failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}

	cfg := getM2MConfig()

	userID, _, err := findUserByEmail(cfg.Endpoint, m2mToken, email)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{Error: "Not authorized"})
	}

	hasSuperUser, err := userHasRole(cfg.Endpoint, m2mToken, userID, superUserRoleID)
	if err != nil || !hasSuperUser {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{Error: "Not authorized"})
	}

	available, err := checkUsernameAvailable(cfg.Endpoint, m2mToken, username)
	if err != nil {
		log.Printf("[Invite] Username availability check failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{Error: "Internal server error"})
	}

	if !available {
		return c.JSON(fiber.Map{
			"available": false,
			"reason":    "taken",
		})
	}

	return c.JSON(fiber.Map{
		"available": true,
	})
}

// ── Logto Management API helpers ────────────────────────────────────

// verifyOneTimeToken validates a Logto one-time token against the given
// email and consumes it on success. A consumed token cannot be verified
// again or used by signIn({extraParams:{one_time_token}}). The caller
// must ensure the user signs in via a different credential afterward
// (in the invite flow, the password they just set).
//
// Returns nil when the token is valid and consumed; a non-nil error
// when it's expired, malformed, unknown, or bound to a different email.
func verifyOneTimeToken(endpoint, token, email, ott string) error {
	payload, _ := json.Marshal(map[string]string{
		"email": email,
		"token": ott,
	})

	req, err := http.NewRequest(
		"POST",
		fmt.Sprintf("%s/api/one-time-tokens/verify", endpoint),
		bytes.NewReader(payload),
	)
	if err != nil {
		return fmt.Errorf("create verify request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("verify request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("verify returned %d: %s", resp.StatusCode, string(body))
}

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

// checkUsernameAvailable checks if a username is available in Logto.
// Logto search is partial match, so we verify exact match in results.
func checkUsernameAvailable(endpoint, token, username string) (bool, error) {
	searchURL := fmt.Sprintf("%s/api/users?search.username=%s", endpoint, url.QueryEscape(username))
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return false, fmt.Errorf("create username search request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("username search request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("username search returned %d: %s", resp.StatusCode, string(body))
	}

	var users []struct {
		Username *string `json:"username"`
	}
	if err := json.Unmarshal(body, &users); err != nil {
		return false, fmt.Errorf("parse username search response: %w", err)
	}

	for _, u := range users {
		if u.Username != nil && *u.Username == username {
			return false, nil // taken
		}
	}
	return true, nil // available
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

// updateUserIdentity sets the username and display name on a Logto user.
// Returns a special error message if Logto rejects the username (422 = taken/invalid).
func updateUserIdentity(endpoint, token, userID, username, name string) error {
	payload, _ := json.Marshal(map[string]string{
		"username": username,
		"name":     name,
	})

	req, err := http.NewRequest("PATCH", fmt.Sprintf("%s/api/users/%s", endpoint, userID), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create identity update request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("identity update request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnprocessableEntity {
		return fmt.Errorf("username_taken")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("identity update returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// updateUserProfile updates a user's gender, birthdate, and optionally name fields via Logto Management API.
func updateUserProfile(endpoint, token, userID, gender, birthdate, givenName, familyName string) error {
	profileFields := map[string]string{
		"gender":    gender,
		"birthdate": birthdate,
	}
	if givenName != "" {
		profileFields["givenName"] = givenName
	}
	if familyName != "" {
		profileFields["familyName"] = familyName
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"profile": profileFields,
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
