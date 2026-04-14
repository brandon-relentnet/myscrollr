package core

import (
	"strings"
)

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
