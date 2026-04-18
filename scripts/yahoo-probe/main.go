// Package main is a read-only probe for the Yahoo Fantasy Sports v2 API.
//
// Usage:
//
//	YAHOO_REFRESH_TOKEN=... YAHOO_CLIENT_ID=... YAHOO_CLIENT_SECRET=... \
//	    go run . <url-path> [outfile]
//
// Example:
//
//	go run . league/469.l.35099/settings out/01-settings.xml
//
// It exchanges the refresh token for a fresh access token and GETs the given
// fantasy/v2 path. XML is re-marshalled with indentation for readability and
// written to `out.xml` (or the outfile argument). Nothing is persisted to
// state, no mutations are performed against Yahoo or anything else.
package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	tokenURL    = "https://api.login.yahoo.com/oauth2/get_token"
	fantasyRoot = "https://fantasysports.yahooapis.com/fantasy/v2"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage:")
		fmt.Fprintln(os.Stderr, "  yahoo-probe <url-path> [outfile]")
		fmt.Fprintln(os.Stderr, "  yahoo-probe --batch <manifest.tsv>")
		fmt.Fprintln(os.Stderr, "  (manifest tab-separated: outfile<TAB>url-path per line, # for comment)")
		os.Exit(1)
	}

	refreshToken := os.Getenv("YAHOO_REFRESH_TOKEN")
	encryptedToken := os.Getenv("YAHOO_REFRESH_TOKEN_ENCRYPTED")
	encryptionKey := os.Getenv("ENCRYPTION_KEY")
	clientID := os.Getenv("YAHOO_CLIENT_ID")
	clientSecret := os.Getenv("YAHOO_CLIENT_SECRET")

	if clientID == "" || clientSecret == "" {
		log.Fatal("YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET must be set")
	}

	// Tokens come in either plaintext (YAHOO_REFRESH_TOKEN) or encrypted
	// (YAHOO_REFRESH_TOKEN_ENCRYPTED + ENCRYPTION_KEY). The encrypted form
	// matches yahoo_users.refresh_token in the prod DB.
	if refreshToken == "" && encryptedToken != "" {
		if encryptionKey == "" {
			log.Fatal("YAHOO_REFRESH_TOKEN_ENCRYPTED requires ENCRYPTION_KEY")
		}
		decrypted, err := decryptToken(encryptedToken, encryptionKey)
		if err != nil {
			log.Fatalf("decrypt refresh token: %v", err)
		}
		refreshToken = decrypted
		log.Printf("[probe] decrypted refresh token (len=%d)", len(refreshToken))
	}

	if refreshToken == "" {
		log.Fatal("must set YAHOO_REFRESH_TOKEN (plaintext) or YAHOO_REFRESH_TOKEN_ENCRYPTED + ENCRYPTION_KEY")
	}

	access, err := refreshAccessToken(refreshToken, clientID, clientSecret)
	if err != nil {
		log.Fatalf("refresh token exchange: %v", err)
	}
	log.Printf("[probe] access token acquired (len=%d)", len(access))

	if os.Args[1] == "--batch" {
		if len(os.Args) < 3 {
			log.Fatal("--batch requires a manifest file")
		}
		runBatch(access, os.Args[2])
		return
	}

	path := strings.TrimPrefix(os.Args[1], "/")
	outfile := "out.xml"
	if len(os.Args) >= 3 {
		outfile = os.Args[2]
	}
	runOne(access, path, outfile)
}

func runOne(access, path, outfile string) {
	raw, statusCode, err := fetchXML(access, path)
	if err != nil {
		log.Printf("[probe] FAIL %s: %v", path, err)
		return
	}
	log.Printf("[probe] GET %s -> %d, %d bytes", path, statusCode, len(raw))

	pretty, err := prettyXML(raw)
	if err != nil {
		log.Printf("[probe] WARN: pretty print failed (%v) — dumping raw body", err)
		pretty = raw
	}

	if err := os.WriteFile(outfile, pretty, 0o644); err != nil {
		log.Printf("[probe] write %s failed: %v", outfile, err)
		return
	}
	log.Printf("[probe] wrote %s (%d bytes)", outfile, len(pretty))
}

func runBatch(access, manifestPath string) {
	b, err := os.ReadFile(manifestPath)
	if err != nil {
		log.Fatalf("read manifest %s: %v", manifestPath, err)
	}
	lines := strings.Split(string(b), "\n")
	count := 0
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			log.Printf("[probe] manifest line %d: need outfile<TAB>path, got %q", i+1, line)
			continue
		}
		outfile := strings.TrimSpace(parts[0])
		path := strings.TrimSpace(parts[1])
		path = strings.TrimPrefix(path, "/")
		runOne(access, path, outfile)
		count++
		// Yahoo rate-limits roughly 1 req/sec. Be polite.
		time.Sleep(300 * time.Millisecond)
	}
	log.Printf("[probe] batch complete: %d paths", count)
}

// refreshAccessToken exchanges a Yahoo refresh token for a fresh access token.
// Yahoo accepts client credentials as form fields (NOT Basic auth).
func refreshAccessToken(refreshToken, clientID, clientSecret string) (string, error) {
	form := url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("status=%d body=%s", resp.StatusCode, string(body))
	}

	// Response is JSON: {"access_token":"...","expires_in":3600,"token_type":"bearer",...}
	// We need only access_token — avoid pulling in a JSON lib for one field.
	s := string(body)
	start := strings.Index(s, `"access_token":"`)
	if start < 0 {
		return "", fmt.Errorf("no access_token in response: %s", s)
	}
	start += len(`"access_token":"`)
	end := strings.Index(s[start:], `"`)
	if end < 0 {
		return "", fmt.Errorf("truncated access_token in response")
	}
	return s[start : start+end], nil
}

// fetchXML performs a GET against the Yahoo fantasy v2 API with the given path.
// Returns the raw body, HTTP status, and any transport error.
func fetchXML(accessToken, path string) ([]byte, int, error) {
	req, err := http.NewRequest("GET", fantasyRoot+"/"+path, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/xml")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

// decryptToken mirrors the Decrypt helper in channels/fantasy/api/helpers.go.
// Wire format: base64( 12-byte-nonce || ciphertext || 16-byte-GCM-tag )
func decryptToken(encrypted, base64Key string) (string, error) {
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("invalid ENCRYPTION_KEY (expected base64-encoded 32 bytes)")
	}
	raw, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", fmt.Errorf("invalid base64 ciphertext: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce := raw[:nonceSize]
	body := raw[nonceSize:]
	pt, err := gcm.Open(nil, nonce, body, nil)
	if err != nil {
		return "", fmt.Errorf("gcm open: %w", err)
	}
	return string(pt), nil
}

// prettyXML re-marshals an XML document with indentation using the generic
// xml.Decoder so we don't need per-response structs.
func prettyXML(raw []byte) ([]byte, error) {
	dec := xml.NewDecoder(bytes.NewReader(raw))
	var buf bytes.Buffer
	enc := xml.NewEncoder(&buf)
	enc.Indent("", "  ")
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if err := enc.EncodeToken(tok); err != nil {
			return nil, err
		}
	}
	if err := enc.Flush(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
