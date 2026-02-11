package core

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"
)

// IntegrationRoute describes a route registered by an integration.
type IntegrationRoute struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Auth   bool   `json:"auth"`
}

// IntegrationInfo describes a discovered integration from Redis.
type IntegrationInfo struct {
	Name         string             `json:"name"`
	DisplayName  string             `json:"display_name"`
	InternalURL  string             `json:"internal_url"`
	Capabilities []string           `json:"capabilities"`
	CDCTables    []string           `json:"cdc_tables"`
	Routes       []IntegrationRoute `json:"routes"`
}

// Discovery manages runtime integration discovery via Redis.
type Discovery struct {
	mu           sync.RWMutex
	integrations map[string]*IntegrationInfo // keyed by name
	tableIndex   map[string]string           // table_name -> integration name
}

var globalDiscovery = &Discovery{
	integrations: make(map[string]*IntegrationInfo),
	tableIndex:   make(map[string]string),
}

// StartDiscovery performs an initial synchronous scan to discover integrations,
// then starts a background loop to refresh every 10 seconds.
// The initial scan blocks so that proxy routes can be set up with known integrations.
func StartDiscovery() {
	globalDiscovery.refresh()
	go globalDiscovery.run()
}

func (d *Discovery) run() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		d.refresh()
	}
}

func (d *Discovery) refresh() {
	ctx := context.Background()

	// Scan for all integration:* keys
	var cursor uint64
	integrations := make(map[string]*IntegrationInfo)
	tableIndex := make(map[string]string)

	for {
		keys, nextCursor, err := Rdb.Scan(ctx, cursor, "integration:*", 100).Result()
		if err != nil {
			log.Printf("[Discovery] Redis scan error: %v", err)
			return
		}

		for _, key := range keys {
			val, err := Rdb.Get(ctx, key).Result()
			if err != nil {
				continue
			}
			var info IntegrationInfo
			if err := json.Unmarshal([]byte(val), &info); err != nil {
				log.Printf("[Discovery] Failed to parse integration %s: %v", key, err)
				continue
			}
			integrations[info.Name] = &info
			for _, table := range info.CDCTables {
				tableIndex[table] = info.Name
			}
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	d.mu.Lock()
	d.integrations = integrations
	d.tableIndex = tableIndex
	d.mu.Unlock()

	if len(integrations) > 0 {
		names := make([]string, 0, len(integrations))
		for name := range integrations {
			names = append(names, name)
		}
		log.Printf("[Discovery] Found %d integration(s): %v", len(integrations), names)
	}
}

// GetAllIntegrations returns a snapshot of all discovered integrations.
func GetAllIntegrations() []*IntegrationInfo {
	globalDiscovery.mu.RLock()
	defer globalDiscovery.mu.RUnlock()

	result := make([]*IntegrationInfo, 0, len(globalDiscovery.integrations))
	for _, info := range globalDiscovery.integrations {
		result = append(result, info)
	}
	return result
}

// GetIntegration returns info for a specific integration by name.
func GetIntegration(name string) *IntegrationInfo {
	globalDiscovery.mu.RLock()
	defer globalDiscovery.mu.RUnlock()
	return globalDiscovery.integrations[name]
}

// GetIntegrationForTable returns the integration that handles a specific CDC table.
func GetIntegrationForTable(tableName string) *IntegrationInfo {
	globalDiscovery.mu.RLock()
	name, ok := globalDiscovery.tableIndex[tableName]
	globalDiscovery.mu.RUnlock()

	if !ok {
		return nil
	}
	return GetIntegration(name)
}

// GetValidStreamTypes returns a set of all registered integration names.
// These are the valid stream types for user_streams.
func GetValidStreamTypes() map[string]bool {
	globalDiscovery.mu.RLock()
	defer globalDiscovery.mu.RUnlock()

	types := make(map[string]bool, len(globalDiscovery.integrations))
	for name := range globalDiscovery.integrations {
		types[name] = true
	}
	return types
}

// GetIntegrationRoutes returns all routes from all discovered integrations.
func GetIntegrationRoutes() []struct {
	Integration *IntegrationInfo
	Route       IntegrationRoute
} {
	globalDiscovery.mu.RLock()
	defer globalDiscovery.mu.RUnlock()

	var routes []struct {
		Integration *IntegrationInfo
		Route       IntegrationRoute
	}
	for _, info := range globalDiscovery.integrations {
		for _, route := range info.Routes {
			routes = append(routes, struct {
				Integration *IntegrationInfo
				Route       IntegrationRoute
			}{info, route})
		}
	}
	return routes
}

// HasCapability checks if an integration has a specific capability.
func (info *IntegrationInfo) HasCapability(cap string) bool {
	for _, c := range info.Capabilities {
		if c == cap {
			return true
		}
	}
	return false
}
