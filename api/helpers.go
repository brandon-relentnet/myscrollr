package main

import (
	"os"
	"strings"
)

// cleanFQDN reads COOLIFY_FQDN from the environment and returns the bare
// hostname with any scheme prefix (https://, http://) and trailing slash
// stripped. Returns an empty string if the variable is not set.
func cleanFQDN() string {
	fqdn := os.Getenv("COOLIFY_FQDN")
	if fqdn == "" {
		return ""
	}
	fqdn = strings.TrimPrefix(fqdn, "https://")
	fqdn = strings.TrimPrefix(fqdn, "http://")
	fqdn = strings.TrimSuffix(fqdn, "/")
	return fqdn
}
