package core

import (
	"context"
	"log"
	"strings"
	"sync"
)

// Client represents a single SSE connection tied to an authenticated user.
type Client struct {
	UserID string
	Ch     chan []byte
}

// Hub maintains per-user SSE client connections and routes messages from
// Redis per-user channels to the correct clients.
type Hub struct {
	clients map[string][]*Client

	register   chan *Client
	unregister chan *Client

	lock sync.Mutex
}

var globalHub = &Hub{
	register:   make(chan *Client),
	unregister: make(chan *Client),
	clients:    make(map[string][]*Client),
}

// Run starts the hub's main loop. It exits when ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	go h.listenToRedis(ctx)

	log.Println("[EventHub] Hub started (per-user mode)")

	for {
		select {
		case <-ctx.Done():
			log.Println("[EventHub] Hub shutting down")
			h.lock.Lock()
			for _, clients := range h.clients {
				for _, c := range clients {
					close(c.Ch)
				}
			}
			h.clients = make(map[string][]*Client)
			h.lock.Unlock()
			return

		case client := <-h.register:
			h.lock.Lock()
			h.clients[client.UserID] = append(h.clients[client.UserID], client)
			h.lock.Unlock()

		case client := <-h.unregister:
			h.lock.Lock()
			clients := h.clients[client.UserID]
			for i, c := range clients {
				if c == client {
					h.clients[client.UserID] = append(clients[:i], clients[i+1:]...)
					close(c.Ch)
					break
				}
			}
			if len(h.clients[client.UserID]) == 0 {
				delete(h.clients, client.UserID)
			}
			h.lock.Unlock()
		}
	}
}

// listenToRedis subscribes to all per-user channels via pattern and routes
// messages to the correct SSE clients. Exits when ctx is cancelled.
func (h *Hub) listenToRedis(ctx context.Context) {
	pubsub := PSubscribe(ctx, RedisEventsUserPrefix+"*")
	defer pubsub.Close()

	ch := pubsub.Channel()

	log.Printf("[EventHub] Listening to Redis pattern: %s*", RedisEventsUserPrefix)

	for {
		select {
		case <-ctx.Done():
			log.Println("[EventHub] Redis listener shutting down")
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			parts := strings.SplitN(msg.Channel, RedisEventsUserPrefix, 2)
			if len(parts) != 2 || parts[1] == "" {
				continue
			}
			userID := parts[1]

			h.lock.Lock()
			clients := h.clients[userID]
			for _, client := range clients {
				select {
				case client.Ch <- []byte(msg.Payload):
				default:
					// Client buffer full, skip this message to avoid blocking
				}
			}
			h.lock.Unlock()
		}
	}
}

// InitHub starts the global event hub with context for graceful shutdown.
func InitHub(ctx context.Context) {
	go globalHub.Run(ctx)
}

// SendToUser publishes a pre-serialised message to a specific user's Redis channel.
// This is called by the webhook handler after routing CDC events.
func SendToUser(sub string, msg []byte) {
	if err := PublishRaw(RedisEventsUserPrefix+sub, msg); err != nil {
		log.Printf("[EventHub] Failed to send to user %s: %v", sub, err)
	}
}

// RegisterClient adds an authenticated client to the hub.
func RegisterClient(userID string) *Client {
	client := &Client{
		UserID: userID,
		Ch:     make(chan []byte, SSEClientBufferSize),
	}
	globalHub.register <- client
	return client
}

// UnregisterClient removes a client from the hub.
func UnregisterClient(client *Client) {
	globalHub.unregister <- client
}

// ClientCount returns the total number of connected SSE clients across all users.
func ClientCount() int {
	globalHub.lock.Lock()
	defer globalHub.lock.Unlock()
	count := 0
	for _, clients := range globalHub.clients {
		count += len(clients)
	}
	return count
}

// RouteToStreamSubscribers sends a CDC event to all users subscribed to a stream type.
func RouteToStreamSubscribers(ctx context.Context, setKey string, payload []byte) {
	subs, err := GetSubscribers(ctx, setKey)
	if err != nil {
		log.Printf("[Sequin] Failed to get subscribers for %s: %v", setKey, err)
		return
	}
	for _, sub := range subs {
		SendToUser(sub, payload)
	}
}

// RouteToRecordOwner sends a CDC event directly to the user identified in the record.
func RouteToRecordOwner(record map[string]interface{}, field string, payload []byte) {
	sub, ok := record[field].(string)
	if !ok || sub == "" {
		return
	}
	SendToUser(sub, payload)
}
