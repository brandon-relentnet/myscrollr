package core

import (
	"os"
	"strings"
)

// CleanFQDN reads COOLIFY_FQDN from the environment and returns the bare
// hostname with any scheme prefix (https://, http://) and trailing slash
// stripped. Returns an empty string if the variable is not set.
func CleanFQDN() string {
	fqdn := os.Getenv("COOLIFY_FQDN")
	if fqdn == "" {
		return ""
	}
	fqdn = strings.TrimPrefix(fqdn, "https://")
	fqdn = strings.TrimPrefix(fqdn, "http://")
	fqdn = strings.TrimSuffix(fqdn, "/")
	return fqdn
}

// ValidateURL cleans a URL string, ensuring it has a scheme prefix.
// Returns the fallback if the input is empty.
func ValidateURL(urlStr, fallback string) string {
	if urlStr == "" {
		return fallback
	}
	urlStr = strings.TrimSpace(urlStr)
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		urlStr = "https://" + urlStr
	}
	return strings.TrimSuffix(urlStr, "/")
}
