package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// =============================================================================
// Logto Management API (M2M) — token acquisition + role assignment
// =============================================================================

var (
	m2mToken       string
	m2mTokenExpiry time.Time
	m2mMu          sync.Mutex
)

// logtoM2MConfig holds the env-derived configuration for M2M calls.
type logtoM2MConfig struct {
	Endpoint  string // e.g. https://auth.myscrollr.relentnet.dev
	AppID     string
	AppSecret string
	RoleID    string
	Resource  string // https://default.logto.app/api
}

// getM2MConfig reads Logto M2M config from environment once.
func getM2MConfig() logtoM2MConfig {
	endpoint := os.Getenv("LOGTO_ENDPOINT")
	if endpoint == "" {
		endpoint = "https://auth.myscrollr.relentnet.dev"
	}
	endpoint = strings.TrimSuffix(endpoint, "/")

	resource := os.Getenv("LOGTO_M2M_RESOURCE")
	if resource == "" {
		resource = "https://default.logto.app/api"
	}

	return logtoM2MConfig{
		Endpoint:  endpoint,
		AppID:     os.Getenv("LOGTO_M2M_APP_ID"),
		AppSecret: os.Getenv("LOGTO_M2M_APP_SECRET"),
		RoleID:    os.Getenv("LOGTO_UPLINK_ROLE_ID"),
		Resource:  resource,
	}
}

// getM2MToken returns a cached M2M access token, refreshing if expired.
func getM2MToken() (string, error) {
	m2mMu.Lock()
	defer m2mMu.Unlock()

	// Return cached token if still valid (with buffer)
	if m2mToken != "" && time.Now().Before(m2mTokenExpiry) {
		return m2mToken, nil
	}

	cfg := getM2MConfig()
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return "", fmt.Errorf("LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET must be set")
	}

	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("resource", cfg.Resource)
	data.Set("scope", "all")

	req, err := http.NewRequest("POST", cfg.Endpoint+"/oidc/token", strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("create M2M token request: %w", err)
	}
	req.SetBasicAuth(cfg.AppID, cfg.AppSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("M2M token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("M2M token request returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("parse M2M token response: %w", err)
	}

	m2mToken = tokenResp.AccessToken
	m2mTokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn-LogtoM2MTokenBufferSecs) * time.Second)

	log.Println("[Logto M2M] Acquired new management API token")
	return m2mToken, nil
}

// AssignUplinkRole assigns the "uplink" role to a Logto user via Management API.
func AssignUplinkRole(logtoSub string) error {
	cfg := getM2MConfig()
	if cfg.RoleID == "" {
		return fmt.Errorf("LOGTO_UPLINK_ROLE_ID must be set")
	}

	token, err := getM2MToken()
	if err != nil {
		return err
	}

	payload, _ := json.Marshal(map[string][]string{
		"roleIds": {cfg.RoleID},
	})

	reqURL := fmt.Sprintf("%s/api/users/%s/roles", cfg.Endpoint, logtoSub)
	req, err := http.NewRequest("POST", reqURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create assign role request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("assign role request failed: %w", err)
	}
	defer resp.Body.Close()

	// 201 = assigned, 422 = already assigned (both are fine)
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusUnprocessableEntity {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("assign role returned %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("[Logto M2M] Assigned uplink role to user %s", logtoSub)
	return nil
}

// RemoveUplinkRole removes the "uplink" role from a Logto user via Management API.
func RemoveUplinkRole(logtoSub string) error {
	cfg := getM2MConfig()
	if cfg.RoleID == "" {
		return fmt.Errorf("LOGTO_UPLINK_ROLE_ID must be set")
	}

	token, err := getM2MToken()
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/api/users/%s/roles/%s", cfg.Endpoint, logtoSub, cfg.RoleID)
	req, err := http.NewRequest("DELETE", reqURL, nil)
	if err != nil {
		return fmt.Errorf("create remove role request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: LogtoM2MTokenTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("remove role request failed: %w", err)
	}
	defer resp.Body.Close()

	// 204 = removed, 404 = not assigned (both are fine)
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("remove role returned %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("[Logto M2M] Removed uplink role from user %s", logtoSub)
	return nil
}
