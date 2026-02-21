package core

import (
	"context"
	"fmt"
	"hash/fnv"
	"log"
	"strings"
	"sync"
	"sync/atomic"
)

// Client represents a single SSE connection tied to an authenticated user.
type Client struct {
	UserID string
	Ch     chan []byte
}

// clientList wraps a []*Client slice so it can be stored in sync.Map.
// sync.Map.CompareAndSwap requires comparable values, and Go slices are NOT
// comparable (using == on a slice panics at runtime). Wrapping in a struct
// and storing a *clientList makes the value a pointer, which IS comparable.
type clientList struct {
	entries []*Client
}

// trySend attempts a non-blocking send, recovering from closed-channel panics.
func trySend(client *Client, payload []byte) bool {
	defer func() { recover() }()
	select {
	case client.Ch <- payload:
		return true
	default:
		return false
	}
}

// Hub maintains per-user SSE client connections and a topic subscription
// registry. Messages arrive on topic channels (one per CDC event) and are
// fanned out to subscribed clients in-memory.
type Hub struct {
	// clients maps userID -> *clientList
	clients     sync.Map
	clientCount atomic.Int64

	// Topic subscription registry
	registry *topicRegistry
}

var globalHub *Hub

// InitHub creates the topic-based hub and starts the listener.
func InitHub(ctx context.Context) {
	globalHub = &Hub{
		registry: &topicRegistry{},
	}

	go globalHub.listenToTopics(ctx)

	// Shutdown watcher
	go func() {
		<-ctx.Done()
		log.Println("[EventHub] Hub shutting down")
		globalHub.clients.Range(func(key, value any) bool {
			list := value.(*clientList)
			for _, c := range list.entries {
				close(c.Ch)
			}
			globalHub.clients.Delete(key)
			return true
		})
	}()

	log.Println("[EventHub] Hub started (topic-based mode)")
}

// listenToTopics subscribes to all CDC topic patterns and dispatches to
// registered clients based on the topic subscription registry.
func (h *Hub) listenToTopics(ctx context.Context) {
	pubsub := PSubscribe(ctx,
		TopicPrefixFinance+"*",
		TopicPrefixSports+"*",
		TopicPrefixRSS+"*",
		TopicPrefixFantasy+"*",
		TopicPrefixCore+"*",
	)
	defer pubsub.Close()

	ch := pubsub.Channel()

	log.Printf("[EventHub] Listening to topic patterns: %s* %s* %s* %s* %s*",
		TopicPrefixFinance, TopicPrefixSports, TopicPrefixRSS,
		TopicPrefixFantasy, TopicPrefixCore)

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			topic := msg.Channel
			payload := []byte(msg.Payload)

			// Special case: core user-specific topics (user_preferences, user_channels).
			// These target a single user directly -- no registry lookup needed.
			if strings.HasPrefix(topic, TopicPrefixCore) {
				userID := topic[len(TopicPrefixCore):]
				h.dispatchToUser(userID, payload)
				continue
			}

			// Look up all users subscribed to this topic
			users := h.registry.getUsersForTopic(topic)
			if users == nil {
				continue
			}

			// Fan-out in memory (no Redis, no network)
			for userID := range users {
				h.dispatchToUser(userID, payload)
			}
		}
	}
}

// dispatchToUser sends a payload to all SSE clients for a given user.
func (h *Hub) dispatchToUser(userID string, payload []byte) {
	value, ok := h.clients.Load(userID)
	if !ok {
		return
	}
	list := value.(*clientList)
	for _, client := range list.entries {
		trySend(client, payload)
	}
}

// register adds an authenticated client to the hub.
func (h *Hub) register(client *Client) {
	for {
		existing, loaded := h.clients.Load(client.UserID)
		if loaded {
			old := existing.(*clientList)
			newList := &clientList{
				entries: append(old.entries, client),
			}
			if h.clients.CompareAndSwap(client.UserID, old, newList) {
				break
			}
			// CAS failed -- another goroutine modified the list; retry
		} else {
			newList := &clientList{entries: []*Client{client}}
			if _, swapped := h.clients.LoadOrStore(client.UserID, newList); !swapped {
				break
			}
			// Another goroutine stored first; retry with Load path
		}
	}
	h.clientCount.Add(1)
}

// unregister removes a client from the hub, closes its channel, and removes
// all topic subscriptions if this was the user's last connection.
func (h *Hub) unregister(client *Client) {
	var lastConnection bool
	for {
		existing, ok := h.clients.Load(client.UserID)
		if !ok {
			return
		}
		old := existing.(*clientList)
		var newEntries []*Client
		found := false
		for _, c := range old.entries {
			if c == client {
				found = true
				close(c.Ch)
			} else {
				newEntries = append(newEntries, c)
			}
		}
		if !found {
			return
		}
		if len(newEntries) == 0 {
			lastConnection = true
			if h.clients.CompareAndDelete(client.UserID, old) {
				break
			}
		} else {
			newList := &clientList{entries: newEntries}
			if h.clients.CompareAndSwap(client.UserID, old, newList) {
				break
			}
		}
		// CAS failed; retry
	}
	h.clientCount.Add(-1)

	// Clean up topic subscriptions when the user's last connection closes
	if lastConnection {
		h.registry.unsubscribeAll(client.UserID)
	}
}

// --- Public API ---

// RegisterClient adds an authenticated client to the hub and subscribes
// them to the correct topics based on their channel configuration.
func RegisterClient(userID string) *Client {
	client := &Client{
		UserID: userID,
		Ch:     make(chan []byte, SSEClientBufferSize),
	}
	globalHub.register(client)

	// Subscribe to topics on first connection for this user.
	// If the user already has connections, this is a no-op (idempotent).
	go subscribeUserToTopics(userID)

	return client
}

// UnregisterClient removes a client from the hub.
func UnregisterClient(client *Client) {
	globalHub.unregister(client)
}

// ClientCount returns the total number of connected SSE clients.
func ClientCount() int {
	return int(globalHub.clientCount.Load())
}

// SubscribeToTopic adds a user to a topic in the registry.
func SubscribeToTopic(userID, topic string) {
	globalHub.registry.subscribe(userID, topic)
}

// UnsubscribeFromTopic removes a user from a topic in the registry.
func UnsubscribeFromTopic(userID, topic string) {
	globalHub.registry.unsubscribe(userID, topic)
}

// UpdateUserTopicSubscriptions rebuilds a user's topic subscriptions.
// Called from channel CRUD handlers when a user modifies their channels.
// Only operates if the user has an active SSE connection.
func UpdateUserTopicSubscriptions(userID string) {
	if _, ok := globalHub.clients.Load(userID); !ok {
		return // No active connection, nothing to update
	}
	globalHub.registry.unsubscribeAll(userID)
	go subscribeUserToTopics(userID)
}

// RouteToRecordOwner sends a CDC event directly to the user identified in the record.
// In Phase 3, this publishes to the core topic channel instead of per-user Redis.
func RouteToRecordOwner(record map[string]interface{}, field string, payload []byte) {
	sub, ok := record[field].(string)
	if !ok || sub == "" {
		return
	}
	if err := PublishRaw(TopicPrefixCore+sub, payload); err != nil {
		log.Printf("[EventHub] Failed to publish to core topic for %s: %v", sub, err)
	}
}

// PublishToTopic publishes a CDC payload to a topic channel.
// This is the Phase 3 replacement for SendToUsers.
func PublishToTopic(topic string, payload []byte) {
	if err := PublishRaw(topic, payload); err != nil {
		log.Printf("[EventHub] Failed to publish to topic %s: %v", topic, err)
	}
}

// TopicForRSSFeed returns the topic channel for an RSS feed URL.
// Uses FNV-1a hash because RSS URLs can contain characters that break
// Redis channel patterns (:, *, ?).
func TopicForRSSFeed(feedURL string) string {
	h := fnv.New32a()
	h.Write([]byte(feedURL))
	return fmt.Sprintf("%s%08x", TopicPrefixRSS, h.Sum32())
}

// subscribeUserToTopics reads the user's channel subscriptions from the DB
// and registers them in the Hub's topic registry.
func subscribeUserToTopics(userID string) {
	ctx := context.Background()

	// Core user-specific topics (user_preferences, user_channels) are handled
	// by direct dispatch in listenToTopics -- no registry entry needed.

	channels, err := GetUserChannels(userID)
	if err != nil {
		log.Printf("[EventHub] Failed to load channels for %s: %v", userID, err)
		return
	}

	for _, ch := range channels {
		if !ch.Enabled {
			continue
		}

		switch ch.ChannelType {
		case "finance":
			symbols := extractSymbolsFromConfig(ch.Config)
			for _, sym := range symbols {
				globalHub.registry.subscribe(userID, TopicPrefixFinance+sym)
			}

		case "sports":
			// Subscribe to all leagues. Per-league filtering via config
			// can be added later.
			for _, league := range SportsLeagues {
				globalHub.registry.subscribe(userID, TopicPrefixSports+league)
			}

		case "rss":
			feeds := extractFeedURLsFromConfig(ch.Config)
			for _, feedURL := range feeds {
				globalHub.registry.subscribe(userID, TopicForRSSFeed(feedURL))
			}

		case "fantasy":
			leagueKeys, err := getUserFantasyLeagues(ctx, userID)
			if err != nil {
				log.Printf("[EventHub] Failed to load fantasy leagues for %s: %v", userID, err)
				continue
			}
			for _, lk := range leagueKeys {
				globalHub.registry.subscribe(userID, TopicPrefixFantasy+lk)
			}
		}
	}
}

// extractSymbolsFromConfig reads the "symbols" array from a channel's config JSONB.
// Config shape: {"symbols": ["AAPL", "GOOG", ...]}
func extractSymbolsFromConfig(config map[string]interface{}) []string {
	raw, ok := config["symbols"]
	if !ok {
		return nil
	}
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	symbols := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok && s != "" {
			symbols = append(symbols, s)
		}
	}
	return symbols
}

// extractFeedURLsFromConfig reads feed URLs from a channel's config JSONB.
// Config shape: {"feeds": [{"url": "https://...", "name": "..."}, ...]}
func extractFeedURLsFromConfig(config map[string]interface{}) []string {
	raw, ok := config["feeds"]
	if !ok {
		return nil
	}
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	urls := make([]string, 0, len(arr))
	for _, v := range arr {
		feed, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		if u, ok := feed["url"].(string); ok && u != "" {
			urls = append(urls, u)
		}
	}
	return urls
}

// getUserFantasyLeagues returns the Yahoo league keys a user has imported.
func getUserFantasyLeagues(ctx context.Context, userID string) ([]string, error) {
	rows, err := DBPool.Query(ctx, `
		SELECT yl.league_key
		FROM yahoo_leagues yl
		INNER JOIN yahoo_users yu ON yu.guid = yl.guid
		WHERE yu.logto_sub = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query fantasy leagues: %w", err)
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			continue
		}
		keys = append(keys, key)
	}
	return keys, nil
}
