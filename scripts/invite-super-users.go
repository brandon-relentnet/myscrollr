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
	LogtoEndpoint   string
	LogtoAppID      string
	LogtoAppSecret  string
	LogtoResource   string
	ResendAPIKey    string
	ResendFrom      string
	FrontendURL     string
	SuperUserRoleID string
}

// Last-known production value for the Logto super_user role. Used as a
// fallback when LOGTO_SUPER_USER_ROLE_ID is unset so the script keeps
// working out of the box for the current Logto deployment. If you ever
// rotate the role ID in Logto, set the env var rather than editing
// this constant — the API server reads the same env var
// (api/core/invite.go) so keeping them aligned avoids drift.
const fallbackSuperUserRoleID = "saaf40fy2iaxu1bwhy0m8"

func loadConfig() config {
	c := config{
		LogtoEndpoint:   os.Getenv("LOGTO_ENDPOINT"),
		LogtoAppID:      os.Getenv("LOGTO_M2M_APP_ID"),
		LogtoAppSecret:  os.Getenv("LOGTO_M2M_APP_SECRET"),
		LogtoResource:   os.Getenv("LOGTO_M2M_RESOURCE"),
		ResendAPIKey:    os.Getenv("RESEND_API_KEY"),
		ResendFrom:      os.Getenv("RESEND_FROM_EMAIL"),
		FrontendURL:     os.Getenv("FRONTEND_URL"),
		SuperUserRoleID: os.Getenv("LOGTO_SUPER_USER_ROLE_ID"),
	}
	if c.LogtoResource == "" {
		c.LogtoResource = "https://default.logto.app/api"
	}
	if c.FrontendURL == "" {
		c.FrontendURL = "https://myscrollr.com"
	}
	if c.SuperUserRoleID == "" {
		c.SuperUserRoleID = fallbackSuperUserRoleID
		fmt.Printf("LOGTO_SUPER_USER_ROLE_ID not set; falling back to %q\n", fallbackSuperUserRoleID)
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

func randomPassword() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b) + "Aa1!" // Ensure complexity requirements
}

// createUser creates a Logto user and returns the user ID.
func createUser(endpoint, token, email, password string) (string, error) {
	payload := map[string]interface{}{
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

// inviteSubject keeps the recipient's inbox preview readable. Inboxes
// typically render ~50 chars of subject + ~80 chars of preheader, so
// the subject states what / preheader states why-bother.
const inviteSubject = "Welcome to MyScrollr Early Access"

const invitePreheader = "Your Super User account is ready. Setup takes about a minute."

const inviteSupportAddress = "support@myscrollr.com"

// inviteHTMLTemplate is the production HTML body. Two `%s` placeholders:
//  1. preheader text (hidden in body, shown in inbox preview)
//  2. invite URL (used in CTA button)
//
// Design notes:
//   - Table-based layout (max email-client compatibility — Outlook
//     for Windows still chokes on flexbox/grid).
//   - Light-mode by default (most clients render light by default);
//     `prefers-color-scheme: dark` media query overrides for dark
//     clients. Some clients ignore the media query — that's why the
//     light-mode palette is the safe baseline.
//   - 560px max width (standard email column; mobile media query
//     drops to full-width with reduced padding).
//   - Brand color #10b981 (emerald-500) — matches Scrollr's accent.
//   - Body uses neutral system fonts to avoid web-font load issues
//     in clients that block external assets.
//   - All styles are inlined except the <style> block in <head>,
//     which only handles dark-mode and mobile responsiveness (Gmail
//     keeps these; clients that strip <style> still get the inlined
//     light-mode baseline).
const inviteHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Welcome to MyScrollr Early Access</title>
<style>
  body { margin: 0; padding: 0; background: #f5f5f5; }
  @media only screen and (max-width: 600px) {
    .container { width: 100%% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .h1 { font-size: 22px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a !important; }
    .card { background: #141414 !important; border-color: #262626 !important; }
    .footer-bg { background: #0f0f0f !important; }
    .step-bg { background: #1a1a1a !important; border-color: #262626 !important; }
    .h1, .step-num { color: #ffffff !important; }
    .text-secondary { color: #a0a0a0 !important; }
    .text-muted { color: #666666 !important; }
    .text-strong { color: #e5e5e5 !important; }
  }
</style>
</head>
<body>
<!-- Preheader: hidden in body, shown in inbox preview -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f5f5f5;mso-hide:all;">%s</div>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>

<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" class="container" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">

        <!-- Card -->
        <tr><td class="card" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">

            <!-- Header: brand + super-user pill -->
            <tr>
              <td class="px" style="padding:28px 32px 12px;">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle" style="font-size:18px;font-weight:700;letter-spacing:-0.4px;color:#10b981;">
                      MyScrollr
                    </td>
                    <td valign="middle" align="right">
                      <span style="display:inline-block;padding:4px 10px;background:rgba(16,185,129,0.1);color:#10b981;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;">
                        Early Access
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Hero -->
            <tr>
              <td class="px" style="padding:16px 32px 8px;">
                <h1 class="h1" style="margin:0 0 12px;font-size:28px;font-weight:700;line-height:1.15;color:#111111;letter-spacing:-0.5px;">
                  You're in.
                </h1>
                <p class="text-secondary" style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#555555;">
                  You've been picked to test MyScrollr before public launch. Your
                  <strong class="text-strong" style="color:#111111;font-weight:600;">Super User</strong>
                  account is ready &mdash; setup takes about a minute.
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:0 32px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr><td style="background:#10b981;border-radius:8px;">
                    <a href="%s" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      Set up your account &rarr;
                    </a>
                  </td></tr>
                </table>
              </td>
            </tr>

            <!-- Onboarding Steps -->
            <tr>
              <td class="px" style="padding:0 32px 24px;">
                <table role="presentation" class="step-bg" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background:#fafafa;border:1px solid #efefef;border-radius:10px;">
                  <tr><td style="padding:18px 20px;">
                    <p style="margin:0 0 12px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#999999;">
                      What happens next
                    </p>
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td valign="top" width="24" style="padding:4px 0;">
                          <span class="step-num" style="display:inline-block;color:#10b981;font-weight:700;font-size:13px;">1.</span>
                        </td>
                        <td style="padding:4px 0;font-size:13.5px;color:#444444;line-height:1.55;">
                          <strong class="text-strong" style="color:#111111;font-weight:600;">Pick a username</strong>
                          &mdash; yours to keep, used as your public profile handle.
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" width="24" style="padding:4px 0;">
                          <span class="step-num" style="display:inline-block;color:#10b981;font-weight:700;font-size:13px;">2.</span>
                        </td>
                        <td style="padding:4px 0;font-size:13.5px;color:#444444;line-height:1.55;">
                          <strong class="text-strong" style="color:#111111;font-weight:600;">Download the desktop app</strong>
                          &mdash; macOS, Windows, or Linux. The link's on the welcome screen.
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" width="24" style="padding:4px 0;">
                          <span class="step-num" style="display:inline-block;color:#10b981;font-weight:700;font-size:13px;">3.</span>
                        </td>
                        <td style="padding:4px 0;font-size:13.5px;color:#444444;line-height:1.55;">
                          <strong class="text-strong" style="color:#111111;font-weight:600;">Sign in once</strong>
                          and start tracking markets, scores, news, and your fantasy teams from the always-on-top ticker.
                        </td>
                      </tr>
                    </table>
                  </td></tr>
                </table>
              </td>
            </tr>

            <!-- Value prop -->
            <tr>
              <td class="px" style="padding:0 32px 28px;">
                <p class="text-secondary" style="margin:0;font-size:13px;line-height:1.65;color:#666666;">
                  <strong class="text-strong" style="color:#111111;font-weight:600;">Quick context:</strong>
                  MyScrollr is an always-on-top desktop ticker that streams live financial markets, sports scores,
                  RSS headlines, and your Yahoo Fantasy leagues &mdash; without browser-tab juggling. As a Super User
                  you get every paid tier free during the testing period plus a direct line to the team. Reply to this
                  email any time with feedback or bugs.
                </p>
              </td>
            </tr>

            <!-- Inner footer -->
            <tr>
              <td class="footer-bg px" style="padding:20px 32px;border-top:1px solid #e5e5e5;background:#fafafa;">
                <p class="text-muted" style="margin:0 0 6px;font-size:11.5px;color:#888888;line-height:1.55;">
                  This invite expires in 7 days. Need a fresh one? Reply &mdash; we'll send another.
                </p>
                <p class="text-muted" style="margin:0;font-size:11.5px;color:#888888;line-height:1.55;">
                  Questions or feedback? Reply to this email or write to
                  <a href="mailto:` + inviteSupportAddress + `" style="color:#10b981;text-decoration:none;font-weight:500;">` + inviteSupportAddress + `</a>.
                </p>
              </td>
            </tr>

          </table>
        </td></tr>

        <!-- Outer footer -->
        <tr><td align="center" style="padding:16px 8px 0;">
          <p class="text-muted" style="margin:0;font-size:11px;color:#aaaaaa;line-height:1.5;">
            MyScrollr &middot; You received this because your email was added to the early access list.
          </p>
        </td></tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`

// inviteTextTemplate mirrors the HTML body for clients that strip
// HTML or for users who view plain-text mode. One `%s` placeholder
// for the invite URL.
const inviteTextTemplate = `Welcome to MyScrollr Early Access

You've been picked to test MyScrollr before public launch. Your
Super User account is ready — setup takes about a minute.

➜ Set up your account
   %s

WHAT HAPPENS NEXT
─────────────────────────────────────────────
1. Pick a username (yours to keep)
2. Download the desktop app — macOS, Windows, or Linux
3. Sign in once and start tracking what matters

QUICK CONTEXT
─────────────────────────────────────────────
MyScrollr is an always-on-top desktop ticker that streams live
financial markets, sports scores, RSS headlines, and your Yahoo
Fantasy leagues — without browser-tab juggling. As a Super User
you get every paid tier free during the testing period plus a
direct line to the team. Reply with feedback any time.

─────────────────────────────────────────────
This invite expires in 7 days. Need a fresh one? Reply and we'll
send another.

Questions? Reply or write to ` + inviteSupportAddress + `.

MyScrollr · You received this because your email was added to the
early access list.
`

func sendInviteEmail(apiKey, from, toEmail, inviteURL string) error {
	htmlBody := fmt.Sprintf(inviteHTMLTemplate, invitePreheader, inviteURL)
	textBody := fmt.Sprintf(inviteTextTemplate, inviteURL)

	payload := map[string]interface{}{
		"from":    from,
		"to":      []string{toEmail},
		"subject": inviteSubject,
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

		// 1. Create user (no username — user picks it during onboarding)
		password := randomPassword()
		userID, err := createUser(cfg.LogtoEndpoint, m2mToken, email, password)
		if err != nil {
			fmt.Printf("  ✗ User creation failed: %v\n", err)
			failures++
			continue
		}
		fmt.Printf("  → user ID: %s\n", userID)

		// 2. Assign super_user role
		if err := assignRole(cfg.LogtoEndpoint, m2mToken, userID, cfg.SuperUserRoleID); err != nil {
			fmt.Printf("  ✗ Role assignment failed: %v\n", err)
			failures++
			continue
		}
		fmt.Printf("  → super_user role assigned\n")

		// 3. Generate one-time token
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

		// 4. Send invite email
		if err := sendInviteEmail(cfg.ResendAPIKey, cfg.ResendFrom, email, inviteURL); err != nil {
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
