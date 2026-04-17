//go:build ignore

package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// loadEnvFile reads a .env file and sets vars that aren't already in the environment.
// Silently skips if the file doesn't exist.
func loadEnvFile() {
	// Look for .env next to the script (scripts/.env)
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	candidates := []string{
		filepath.Join(dir, ".env"),
		"scripts/.env",
		".env",
	}

	var file *os.File
	for _, path := range candidates {
		f, err := os.Open(path)
		if err == nil {
			file = f
			fmt.Printf("Loaded env from %s\n", path)
			break
		}
	}
	if file == nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		// Remove surrounding quotes
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		}
		// Don't override existing env vars
		if os.Getenv(key) == "" {
			os.Setenv(key, value)
		}
	}
}

// ── Configuration ───────────────────────────────────────────────────

type config struct {
	LogtoEndpoint  string
	LogtoAppID     string
	LogtoAppSecret string
	LogtoResource  string
	ResendAPIKey   string
	ResendFrom     string
	FrontendURL    string
}

func loadConfig() config {
	c := config{
		LogtoEndpoint:  os.Getenv("LOGTO_ENDPOINT"),
		LogtoAppID:     os.Getenv("LOGTO_M2M_APP_ID"),
		LogtoAppSecret: os.Getenv("LOGTO_M2M_APP_SECRET"),
		LogtoResource:  os.Getenv("LOGTO_M2M_RESOURCE"),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		ResendFrom:     os.Getenv("RESEND_FROM_EMAIL"),
		FrontendURL:    os.Getenv("FRONTEND_URL"),
	}
	if c.LogtoResource == "" {
		c.LogtoResource = "https://default.logto.app/api"
	}
	if c.FrontendURL == "" {
		c.FrontendURL = "https://myscrollr.com"
	}
	c.FrontendURL = strings.TrimSuffix(c.FrontendURL, "/")
	c.LogtoEndpoint = strings.TrimSuffix(c.LogtoEndpoint, "/")

	// Validate required
	missing := []string{}
	if c.LogtoEndpoint == "" {
		missing = append(missing, "LOGTO_ENDPOINT")
	}
	if c.LogtoAppID == "" {
		missing = append(missing, "LOGTO_M2M_APP_ID")
	}
	if c.LogtoAppSecret == "" {
		missing = append(missing, "LOGTO_M2M_APP_SECRET")
	}
	if c.ResendAPIKey == "" {
		missing = append(missing, "RESEND_API_KEY")
	}
	if c.ResendFrom == "" {
		missing = append(missing, "RESEND_FROM_EMAIL")
	}
	if len(missing) > 0 {
		log.Fatalf("Missing required env vars: %s", strings.Join(missing, ", "))
	}

	return c
}

// ── M2M Token ───────────────────────────────────────────────────────

func getM2MToken(cfg config) (string, error) {
	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("resource", cfg.LogtoResource)
	data.Set("scope", "all")

	req, err := http.NewRequest("POST", cfg.LogtoEndpoint+"/oidc/token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("create token request: %w", err)
	}
	req.SetBasicAuth(cfg.LogtoAppID, cfg.LogtoAppSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("parse token response: %w", err)
	}

	return tokenResp.AccessToken, nil
}

// ── Logto API helpers ───────────────────────────────────────────────

var httpClient = &http.Client{Timeout: 10 * time.Second}

func logtoRequest(method, url string, token string, payload interface{}) ([]byte, int, error) {
	var bodyReader io.Reader
	if payload != nil {
		data, _ := json.Marshal(payload)
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return body, resp.StatusCode, nil
}

// usernameExists checks if a username is taken in Logto.
func usernameExists(endpoint, token, username string) (bool, error) {
	searchURL := fmt.Sprintf("%s/api/users?search.username=%s", endpoint, url.QueryEscape(username))
	body, status, err := logtoRequest("GET", searchURL, token, nil)
	if err != nil {
		return false, err
	}
	if status != http.StatusOK {
		return false, fmt.Errorf("search returned %d: %s", status, string(body))
	}

	var users []struct {
		Username *string `json:"username"`
	}
	if err := json.Unmarshal(body, &users); err != nil {
		return false, err
	}

	// Logto search is partial match, so verify exact match
	for _, u := range users {
		if u.Username != nil && *u.Username == username {
			return true, nil
		}
	}
	return false, nil
}

// deriveUsername generates a unique username from an email prefix.
// Truncates to 12 chars (Logto's max), appends numbers on collision.
func deriveUsername(endpoint, token, email string) (string, error) {
	prefix := strings.Split(email, "@")[0]
	// Sanitize: only keep alphanumeric and underscore
	clean := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			return r
		}
		if r >= 'A' && r <= 'Z' {
			return r + 32 // lowercase
		}
		return '_'
	}, prefix)
	if clean == "" {
		clean = "user"
	}

	// Truncate to 12 chars (Logto username maxLength)
	if len(clean) > 12 {
		clean = clean[:12]
	}

	candidate := clean
	for i := 2; i <= 99; i++ {
		exists, err := usernameExists(endpoint, token, candidate)
		if err != nil {
			return "", fmt.Errorf("check username %s: %w", candidate, err)
		}
		if !exists {
			return candidate, nil
		}
		suffix := fmt.Sprintf("%d", i)
		maxBase := 12 - len(suffix)
		if maxBase < 1 {
			maxBase = 1
		}
		base := clean
		if len(base) > maxBase {
			base = base[:maxBase]
		}
		candidate = base + suffix
	}

	return "", fmt.Errorf("could not find unique username for %s after 99 attempts", email)
}

func randomPassword() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b) + "Aa1!" // Ensure complexity requirements
}

// createUser creates a Logto user and returns the user ID.
func createUser(endpoint, token, username, email, password string) (string, error) {
	payload := map[string]interface{}{
		"username":     username,
		"primaryEmail": email,
		"password":     password,
	}
	body, status, err := logtoRequest("POST", endpoint+"/api/users", token, payload)
	if err != nil {
		return "", fmt.Errorf("create user: %w", err)
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("create user returned %d: %s", status, string(body))
	}

	var user struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", fmt.Errorf("parse create user response: %w", err)
	}
	return user.ID, nil
}

// assignRole assigns a role to a Logto user.
func assignRole(endpoint, token, userID, roleID string) error {
	payload := map[string][]string{"roleIds": {roleID}}
	body, status, err := logtoRequest("POST", fmt.Sprintf("%s/api/users/%s/roles", endpoint, userID), token, payload)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	// 201 = assigned, 422 = already assigned
	if status != http.StatusCreated && status != http.StatusUnprocessableEntity {
		return fmt.Errorf("assign role returned %d: %s", status, string(body))
	}
	return nil
}

// createOneTimeToken generates a one-time token for magic link auth.
func createOneTimeToken(endpoint, token, email string) (string, error) {
	payload := map[string]interface{}{
		"email":     email,
		"expiresIn": 604800, // 7 days
	}
	body, status, err := logtoRequest("POST", endpoint+"/api/one-time-tokens", token, payload)
	if err != nil {
		return "", fmt.Errorf("create one-time token: %w", err)
	}
	if status != http.StatusCreated {
		return "", fmt.Errorf("create one-time token returned %d: %s", status, string(body))
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse one-time token response: %w", err)
	}
	return result.Token, nil
}

// ── Resend email ────────────────────────────────────────────────────

func sendInviteEmail(apiKey, from, toEmail, inviteURL, username string) error {
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background-color:#141414;border:1px solid #262626;border-radius:16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:48px;height:48px;background-color:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2);border-radius:12px;line-height:48px;font-size:24px;">&#x1f6e1;</div>
    </div>
    <h1 style="color:#ffffff;font-size:22px;text-align:center;margin:0 0 8px;">You're Invited to MyScrollr</h1>
    <p style="color:#a0a0a0;font-size:14px;text-align:center;margin:0 0 24px;line-height:1.5;">
      You've been granted <span style="color:#34d399;font-weight:600;">Super User</span> access.
      Your username is <strong style="color:#ffffff;">%s</strong>.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="%s" style="display:inline-block;padding:12px 32px;background-color:#34d399;color:#0a0a0a;font-weight:600;font-size:14px;text-decoration:none;border-radius:8px;">
        Complete Your Account
      </a>
    </div>
    <p style="color:#666;font-size:12px;text-align:center;margin:0;line-height:1.4;">
      This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.
    </p>
  </div>
</body>
</html>`, username, inviteURL)

	textBody := fmt.Sprintf("You've been invited to MyScrollr as a Super User!\n\nYour username: %s\n\nComplete your account: %s\n\nThis link expires in 7 days.", username, inviteURL)

	payload := map[string]interface{}{
		"from":    from,
		"to":      []string{toEmail},
		"subject": "You've been invited to MyScrollr",
		"html":    htmlBody,
		"text":    textBody,
	}

	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("email request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("resend returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ── Main ────────────────────────────────────────────────────────────

const superUserRoleID = "saaf40fy2iaxu1bwhy0m8"

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: go run scripts/invite-super-users.go <emails.json>\n")
		os.Exit(1)
	}

	loadEnvFile()
	cfg := loadConfig()

	// Read email list
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		log.Fatalf("Failed to read file: %v", err)
	}

	var emails []string
	if err := json.Unmarshal(data, &emails); err != nil {
		log.Fatalf("Failed to parse JSON: %v", err)
	}

	if len(emails) == 0 {
		log.Fatal("No emails in the file")
	}

	fmt.Printf("Processing %d invites...\n\n", len(emails))

	// Get M2M token
	m2mToken, err := getM2MToken(cfg)
	if err != nil {
		log.Fatalf("Failed to get M2M token: %v", err)
	}

	var successes, failures int

	for i, email := range emails {
		email = strings.TrimSpace(email)
		if email == "" {
			continue
		}

		fmt.Printf("[%d/%d] %s\n", i+1, len(emails), email)

		// 1. Derive unique username
		username, err := deriveUsername(cfg.LogtoEndpoint, m2mToken, email)
		if err != nil {
			fmt.Printf("  ✗ Username derivation failed: %v\n", err)
			failures++
			continue
		}
		fmt.Printf("  → username: %s\n", username)

		// 2. Create user
		password := randomPassword()
		userID, err := createUser(cfg.LogtoEndpoint, m2mToken, username, email, password)
		if err != nil {
			fmt.Printf("  ✗ User creation failed: %v\n", err)
			failures++
			continue
		}
		fmt.Printf("  → user ID: %s\n", userID)

		// 3. Assign super_user role
		if err := assignRole(cfg.LogtoEndpoint, m2mToken, userID, superUserRoleID); err != nil {
			fmt.Printf("  ✗ Role assignment failed: %v\n", err)
			failures++
			continue
		}
		fmt.Printf("  → super_user role assigned\n")

		// 4. Generate one-time token
		ottToken, err := createOneTimeToken(cfg.LogtoEndpoint, m2mToken, email)
		if err != nil {
			fmt.Printf("  ✗ One-time token creation failed: %v\n", err)
			failures++
			continue
		}

		inviteURL := fmt.Sprintf("%s/invite?token=%s&email=%s",
			cfg.FrontendURL,
			url.QueryEscape(ottToken),
			url.QueryEscape(email),
		)
		fmt.Printf("  → invite URL: %s\n", inviteURL)

		// 5. Send invite email
		if err := sendInviteEmail(cfg.ResendAPIKey, cfg.ResendFrom, email, inviteURL, username); err != nil {
			fmt.Printf("  ✗ Email send failed: %v\n", err)
			failures++
			continue
		}
		fmt.Printf("  ✓ Invite sent!\n")
		successes++
		fmt.Println()
	}

	fmt.Printf("\n══════════════════════════════════\n")
	fmt.Printf("Results: %d succeeded, %d failed (out of %d)\n", successes, failures, len(emails))
}
