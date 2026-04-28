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
// this constant. The API server reads the same env var
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

// userAlreadyExistsErr is returned by `createUser` when Logto's
// `POST /api/users` rejects the request with `user.email_already_in_use`
// (HTTP 422). Callers can switch on this to gracefully recover by
// looking up the existing user by email and proceeding with a
// re-invite instead of treating it as a fatal error.
var userAlreadyExistsErr = fmt.Errorf("user already exists")

// createUser creates a Logto user and returns the user ID. Returns
// `userAlreadyExistsErr` if the email is already registered.
func createUser(endpoint, token, email, password string) (string, error) {
	payload := map[string]interface{}{
		"primaryEmail": email,
		"password":     password,
	}
	body, status, err := logtoRequest("POST", endpoint+"/api/users", token, payload)
	if err != nil {
		return "", fmt.Errorf("create user: %w", err)
	}
	if status == http.StatusUnprocessableEntity && strings.Contains(string(body), "email_already_in_use") {
		return "", userAlreadyExistsErr
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

// findUserIDByEmail looks up an existing Logto user by primary email
// and returns their `id`. Used to recover from `userAlreadyExistsErr`
// during re-invite flows. The `search.primaryEmail` exact-match query
// param is the same pattern used by the API server in
// `api/core/invite.go:findUserByEmail`.
func findUserIDByEmail(endpoint, token, email string) (string, error) {
	searchURL := fmt.Sprintf("%s/api/users?search.primaryEmail=%s", endpoint, url.QueryEscape(email))
	body, status, err := logtoRequest("GET", searchURL, token, nil)
	if err != nil {
		return "", fmt.Errorf("find user: %w", err)
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("find user returned %d: %s", status, string(body))
	}

	var users []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &users); err != nil {
		return "", fmt.Errorf("parse find user response: %w", err)
	}
	if len(users) == 0 {
		return "", fmt.Errorf("no user found with email %s", email)
	}
	return users[0].ID, nil
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
const inviteSubject = "We'd love for you to test out MyScrollr"

const invitePreheader = "You're literally one of our first users. Your account is ready and setup takes about a minute."

// Feedback channel is the in-app Contact Us flow, NOT a public-facing
// email address. The invite-only audience for this script knows the
// app is unreleased and we want feedback consolidated through the
// Contact Us pipeline (which produces tickets) rather than scattered
// across email threads. The "reply to this email" footer line below
// is for invite-flow problems only (lost link, wrong email, etc.)
// and not for product feedback.

// inviteHTMLTemplate is the production HTML body. Two `%s` placeholders:
//  1. preheader text (hidden in body, shown in inbox preview)
//  2. invite URL (used in CTA button)
//
// Design notes:
//   - Table-based layout (max email-client compatibility, since
//     Outlook for Windows still chokes on flexbox/grid).
//   - Light-mode by default (most clients render light by default);
//     `prefers-color-scheme: dark` media query overrides for dark
//     clients. Some clients ignore the media query, which is why the
//     light-mode palette is the safe baseline.
//   - 560px max width (standard email column; mobile media query
//     drops to full-width with reduced padding).
//   - Brand color #10b981 (emerald-500) matches Scrollr's accent.
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
<title>We'd love for you to test out MyScrollr</title>
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
    .step-bg, .feedback-bg { background: #1a1a1a !important; border-color: #262626 !important; }
    .h1, .step-num, .h2 { color: #ffffff !important; }
    .text-secondary { color: #a0a0a0 !important; }
    .text-muted { color: #666666 !important; }
    .text-strong { color: #e5e5e5 !important; }
    .bullet { color: #10b981 !important; }
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

            <!-- Hero + warm intro -->
            <tr>
              <td class="px" style="padding:16px 32px 8px;">
                <h1 class="h1" style="margin:0 0 12px;font-size:28px;font-weight:700;line-height:1.15;color:#111111;letter-spacing:-0.5px;">
                  You're in.
                </h1>
                <p class="text-secondary" style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#555555;">
                  Hey, thank you for testing MyScrollr. You are <em>literally</em> one of our first users, and we
                  really need your help before we ship to the public. Your
                  <strong class="text-strong" style="color:#111111;font-weight:600;">Super User</strong>
                  account is ready and setup takes about a minute.
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:8px 32px 28px;">
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
                          <strong class="text-strong" style="color:#111111;font-weight:600;">Pick a username.</strong>
                          Yours to keep, used as your public profile handle.
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" width="24" style="padding:4px 0;">
                          <span class="step-num" style="display:inline-block;color:#10b981;font-weight:700;font-size:13px;">2.</span>
                        </td>
                        <td style="padding:4px 0;font-size:13.5px;color:#444444;line-height:1.55;">
                          <strong class="text-strong" style="color:#111111;font-weight:600;">Download the desktop app</strong>
                          for macOS, Windows, or Linux. The link is on the welcome screen.
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

            <!-- Your job -->
            <tr>
              <td class="px" style="padding:8px 32px 8px;">
                <h2 class="h2" style="margin:0 0 8px;font-size:17px;font-weight:600;color:#111111;letter-spacing:-0.2px;">
                  Your job: try to break it.
                </h2>
                <p class="text-secondary" style="margin:0 0 12px;font-size:13.5px;line-height:1.6;color:#555555;">
                  Honestly, we want you to push the app until something cracks. If you find any bugs or glitches,
                  let us know. Beyond just finding errors, we would love your honest take on:
                </p>
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0">
                  <tr><td style="padding:0 0 4px;font-size:13.5px;color:#444444;line-height:1.6;">
                    <span class="bullet" style="color:#10b981;font-weight:700;">&bull;</span>&nbsp;&nbsp;What new features would actually be useful to you?
                  </td></tr>
                  <tr><td style="padding:0 0 4px;font-size:13.5px;color:#444444;line-height:1.6;">
                    <span class="bullet" style="color:#10b981;font-weight:700;">&bull;</span>&nbsp;&nbsp;Is there anything you flat out dislike?
                  </td></tr>
                  <tr><td style="padding:0 0 4px;font-size:13.5px;color:#444444;line-height:1.6;">
                    <span class="bullet" style="color:#10b981;font-weight:700;">&bull;</span>&nbsp;&nbsp;How does the design look to you?
                  </td></tr>
                  <tr><td style="padding:0 0 4px;font-size:13.5px;color:#444444;line-height:1.6;">
                    <span class="bullet" style="color:#10b981;font-weight:700;">&bull;</span>&nbsp;&nbsp;Is the app easy to navigate?
                  </td></tr>
                  <tr><td style="padding:0 0 4px;font-size:13.5px;color:#444444;line-height:1.6;">
                    <span class="bullet" style="color:#10b981;font-weight:700;">&bull;</span>&nbsp;&nbsp;Do you actually find it useful?
                  </td></tr>
                  <tr><td style="padding:0 0 0;font-size:13.5px;color:#444444;line-height:1.6;">
                    <span class="bullet" style="color:#10b981;font-weight:700;">&bull;</span>&nbsp;&nbsp;Is it cool?
                  </td></tr>
                </table>
              </td>
            </tr>

            <!-- Where to send feedback (in-app, NOT email) -->
            <tr>
              <td class="px" style="padding:20px 32px 4px;">
                <table role="presentation" class="feedback-bg" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:10px;">
                  <tr><td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#10b981;">
                      Where to send feedback
                    </p>
                    <p class="text-secondary" style="margin:0;font-size:13px;line-height:1.55;color:#555555;">
                      Hit
                      <strong class="text-strong" style="color:#111111;font-weight:600;">Contact Us</strong>
                      inside the app whenever something pops into your head: bug, idea, complaint,
                      &ldquo;this is sweet,&rdquo; whatever. We are reading every single submission and using
                      it to shape the public release.
                    </p>
                  </td></tr>
                </table>
              </td>
            </tr>

            <!-- Thank-you / Ultimate forever -->
            <tr>
              <td class="px" style="padding:18px 32px 28px;">
                <p class="text-secondary" style="margin:0 0 10px;font-size:13px;line-height:1.65;color:#666666;">
                  <strong class="text-strong" style="color:#111111;font-weight:600;">A massive thank you in advance.</strong>
                  We put you on the
                  <strong class="text-strong" style="color:#10b981;font-weight:600;">Ultimate tier</strong>:
                  zero restrictions, fastest data, every feature unlocked. As our way of saying thanks
                  for being one of our first testers, your account keeps complimentary Ultimate access for as
                  long as we operate the early-access program. The fine print lives at
                  <a href="https://myscrollr.com/legal?doc=super-user" style="color:#10b981;text-decoration:none;font-weight:500;">myscrollr.com/legal</a>.
                </p>
              </td>
            </tr>

            <!-- Inner footer -->
            <tr>
              <td class="footer-bg px" style="padding:20px 32px;border-top:1px solid #e5e5e5;background:#fafafa;">
                <p class="text-muted" style="margin:0;font-size:11.5px;color:#888888;line-height:1.55;">
                  This invite expires in 7 days. Lost it? Just reply to this email and we'll send a new one.
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
const inviteTextTemplate = `We'd love for you to test out MyScrollr

Hey, thank you for testing MyScrollr! You are literally one of our
first users, and we really need your help before we ship to the
public. Your Super User account is ready and setup takes about a
minute.

➜ Set up your account
   %s

WHAT HAPPENS NEXT
─────────────────────────────────────────────
1. Pick a username (yours to keep)
2. Download the desktop app for macOS, Windows, or Linux
3. Sign in once and start tracking what matters

YOUR JOB: TRY TO BREAK IT
─────────────────────────────────────────────
Honestly, we want you to push the app until something cracks.
If you find bugs or glitches, let us know. Beyond just finding
errors, we would love your honest take on:

  • What new features would actually be useful to you?
  • Is there anything you flat out dislike?
  • How does the design look to you?
  • Is the app easy to navigate?
  • Do you actually find it useful?
  • Is it cool?

WHERE TO SEND FEEDBACK
─────────────────────────────────────────────
Hit "Contact Us" inside the app whenever something pops into your
head: bug, idea, complaint, "this is sweet," whatever. We are
reading every single submission and using it to shape the public
release.

A MASSIVE THANK YOU IN ADVANCE
─────────────────────────────────────────────
We put you on the Ultimate tier: zero restrictions, fastest data,
every feature unlocked. As our way of saying thanks for being one
of our first testers, your account keeps complimentary Ultimate
access for as long as we operate the early-access program. The
fine print lives at:

   https://myscrollr.com/legal?doc=super-user

─────────────────────────────────────────────
This invite expires in 7 days. Lost it? Just reply and we will
send a new one.

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

		// 1. Create user (no username; user picks it during onboarding).
		// If the email already exists in Logto (re-invite scenario, or
		// the user signed up directly), look them up and re-issue an
		// invite token instead of failing. The role assign + token
		// generation steps below are idempotent so this Just Works.
		password := randomPassword()
		userID, err := createUser(cfg.LogtoEndpoint, m2mToken, email, password)
		if err == userAlreadyExistsErr {
			fmt.Printf("  → user already exists, looking up ID...\n")
			existingID, lookupErr := findUserIDByEmail(cfg.LogtoEndpoint, m2mToken, email)
			if lookupErr != nil {
				fmt.Printf("  ✗ Could not locate existing user: %v\n", lookupErr)
				failures++
				continue
			}
			userID = existingID
		} else if err != nil {
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
