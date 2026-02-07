package main

import (
	"context"
	"log"
	"strings"
	"sync"
)

// Client represents a single SSE connection tied to an authenticated user.
type Client struct {
	userID string
	ch     chan []byte
}

// Hub maintains per-user SSE client connections and routes messages from
// Redis per-user channels to the correct clients.
type Hub struct {
	// userID → list of active clients for that user
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

// Run starts the hub's main loop
func (h *Hub) Run() {
	// Start listening to per-user Redis channels in the background
	go h.listenToRedis()

	log.Println("[EventHub] Hub started (per-user mode)")

	for {
		select {
		case client := <-h.register:
			h.lock.Lock()
			h.clients[client.userID] = append(h.clients[client.userID], client)
			h.lock.Unlock()

		case client := <-h.unregister:
			h.lock.Lock()
			clients := h.clients[client.userID]
			for i, c := range clients {
				if c == client {
					h.clients[client.userID] = append(clients[:i], clients[i+1:]...)
					close(c.ch)
					break
				}
			}
			// Clean up empty user entries
			if len(h.clients[client.userID]) == 0 {
				delete(h.clients, client.userID)
			}
			h.lock.Unlock()
		}
	}
}

// listenToRedis subscribes to all per-user channels via pattern and routes
// messages to the correct SSE clients.
func (h *Hub) listenToRedis() {
	ctx := context.Background()
	pubsub := PSubscribe(ctx, "events:user:*")
	defer pubsub.Close()

	ch := pubsub.Channel()

	log.Println("[EventHub] Listening to Redis pattern: events:user:*")

	for msg := range ch {
		// Channel name is "events:user:{sub}" — extract the sub
		parts := strings.SplitN(msg.Channel, "events:user:", 2)
		if len(parts) != 2 || parts[1] == "" {
			continue
		}
		userID := parts[1]

		h.lock.Lock()
		clients := h.clients[userID]
		for _, client := range clients {
			select {
			case client.ch <- []byte(msg.Payload):
			default:
				// Client buffer full, skip this message to avoid blocking
			}
		}
		h.lock.Unlock()
	}
}

// InitHub starts the global event hub
func InitHub() {
	go globalHub.Run()
}

// SendToUser publishes a pre-serialised message to a specific user's Redis channel.
// This is called by the webhook handler after routing CDC events.
func SendToUser(sub string, msg []byte) {
	go func() {
		if err := PublishRaw("events:user:"+sub, msg); err != nil {
			log.Printf("[EventHub] Failed to send to user %s: %v", sub, err)
		}
	}()
}

// RegisterClient adds an authenticated client to the hub
func RegisterClient(userID string) *Client {
	client := &Client{
		userID: userID,
		ch:     make(chan []byte, 100),
	}
	globalHub.register <- client
	return client
}

// UnregisterClient removes a client from the hub
func UnregisterClient(client *Client) {
	globalHub.unregister <- client
}

// ClientCount returns the total number of connected SSE clients across all users
func ClientCount() int {
	globalHub.lock.Lock()
	defer globalHub.lock.Unlock()
	count := 0
	for _, clients := range globalHub.clients {
		count += len(clients)
	}
	return count
}
