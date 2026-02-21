package core

import (
	"context"
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

// trySend attempts a non-blocking send to a client's buffered channel.
// Returns false if the channel is full or has been closed (client disconnected).
//
// With sync.Map, unregister can close a client's channel while the dispatch
// goroutine is iterating a stale snapshot of the client slice. A bare
// `client.Ch <- payload` would panic with "send on closed channel". The
// deferred recover() catches this safely. The window is extremely narrow
// (between sync.Map.Load and the CAS in unregister) and the client is already
// removed from the map, so no repeated recovery occurs.
func trySend(client *Client, payload []byte) bool {
	defer func() { recover() }()
	select {
	case client.Ch <- payload:
		return true
	default:
		return false
	}
}

// Hub maintains per-user SSE client connections and routes messages from
// Redis per-user channels to the correct clients.
type Hub struct {
	// clients maps userID -> []*Client using sync.Map for lock-free reads.
	// sync.Map is optimal here because reads (message dispatch) vastly
	// outnumber writes (connect/disconnect).
	clients sync.Map

	clientCount atomic.Int64
}

var globalHub = &Hub{}

// Run starts the hub's main loop. It exits when ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	go h.listenToRedis(ctx)

	log.Println("[EventHub] Hub started (per-user mode)")

	<-ctx.Done()
	log.Println("[EventHub] Hub shutting down")

	// Close all client channels
	h.clients.Range(func(key, value any) bool {
		clients := value.([]*Client)
		for _, c := range clients {
			close(c.Ch)
		}
		h.clients.Delete(key)
		return true
	})
}

// register adds an authenticated client to the hub.
func (h *Hub) register(client *Client) {
	for {
		existing, loaded := h.clients.Load(client.UserID)
		var newSlice []*Client
		if loaded {
			newSlice = append(existing.([]*Client), client)
		} else {
			newSlice = []*Client{client}
		}
		if loaded {
			if h.clients.CompareAndSwap(client.UserID, existing, newSlice) {
				break
			}
			// CAS failed — another goroutine modified the slice concurrently; retry
		} else {
			if _, swapped := h.clients.LoadOrStore(client.UserID, newSlice); !swapped {
				break
			}
			// Another goroutine stored first; retry with Load path
		}
	}
	h.clientCount.Add(1)
}

// unregister removes a client from the hub and closes its channel.
func (h *Hub) unregister(client *Client) {
	for {
		existing, ok := h.clients.Load(client.UserID)
		if !ok {
			return
		}
		clients := existing.([]*Client)
		var newSlice []*Client
		found := false
		for _, c := range clients {
			if c == client {
				found = true
				close(c.Ch)
			} else {
				newSlice = append(newSlice, c)
			}
		}
		if !found {
			return
		}
		if len(newSlice) == 0 {
			if h.clients.CompareAndDelete(client.UserID, existing) {
				break
			}
		} else {
			if h.clients.CompareAndSwap(client.UserID, existing, newSlice) {
				break
			}
		}
		// CAS failed; retry
	}
	h.clientCount.Add(-1)
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

			// sync.Map.Load is lock-free — no mutex contention
			value, ok := h.clients.Load(userID)
			if !ok {
				continue // No connected clients for this user
			}
			clients := value.([]*Client)
			payload := []byte(msg.Payload)
			for _, client := range clients {
				trySend(client, payload)
			}
		}
	}
}

// InitHub starts the global event hub with context for graceful shutdown.
func InitHub(ctx context.Context) {
	go globalHub.Run(ctx)
}

// SendToUser publishes a pre-serialised message to a specific user's Redis channel.
// This is called by the webhook handler for single-user routes (core-owned tables).
func SendToUser(sub string, msg []byte) {
	if err := PublishRaw(RedisEventsUserPrefix+sub, msg); err != nil {
		log.Printf("[EventHub] Failed to send to user %s: %v", sub, err)
	}
}

// SendToUsers publishes a pre-serialised message to multiple users' Redis
// channels in a single pipeline round-trip.
func SendToUsers(subs []string, msg []byte) {
	if len(subs) == 0 {
		return
	}

	channels := make([]string, len(subs))
	for i, sub := range subs {
		channels[i] = RedisEventsUserPrefix + sub
	}

	if errCount := PublishBatch(channels, msg); errCount > 0 {
		log.Printf("[EventHub] Failed to send to %d/%d users", errCount, len(subs))
	}
}

// RegisterClient adds an authenticated client to the hub.
func RegisterClient(userID string) *Client {
	client := &Client{
		UserID: userID,
		Ch:     make(chan []byte, SSEClientBufferSize),
	}
	globalHub.register(client)
	return client
}

// UnregisterClient removes a client from the hub.
func UnregisterClient(client *Client) {
	globalHub.unregister(client)
}

// ClientCount returns the total number of connected SSE clients across all users.
func ClientCount() int {
	return int(globalHub.clientCount.Load())
}

// RouteToRecordOwner sends a CDC event directly to the user identified in the record.
func RouteToRecordOwner(record map[string]interface{}, field string, payload []byte) {
	sub, ok := record[field].(string)
	if !ok || sub == "" {
		return
	}
	SendToUser(sub, payload)
}
