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
	Shard  int
	Ch     chan []byte
}

// clientList wraps a []*Client slice so it can be stored in sync.Map.
// sync.Map.CompareAndSwap requires comparable values, and Go slices are NOT
// comparable (using == on a slice panics at runtime). Wrapping in a struct
// and storing a *clientList makes the value a pointer, which IS comparable.
type clientList struct {
	entries []*Client
}

// trySend attempts a non-blocking send to a client's buffered channel.
// Recovers from "send on closed channel" panic that can occur when unregister
// closes a client's channel while the dispatch goroutine holds a stale snapshot.
func trySend(client *Client, payload []byte) bool {
	defer func() { recover() }()
	select {
	case client.Ch <- payload:
		return true
	default:
		return false
	}
}

// hubShard is an independent dispatch worker with its own Redis subscription
// and client registry.
type hubShard struct {
	id      int
	clients sync.Map // userID -> *clientList
}

// Hub maintains sharded per-user SSE client connections and routes messages
// from Redis per-user channels to the correct clients.
type Hub struct {
	shards      [HubShardCount]*hubShard
	clientCount atomic.Int64
}

var globalHub *Hub

// shardFor returns the shard index for a given user ID.
func shardFor(userID string) int {
	h := fnv.New32a()
	h.Write([]byte(userID))
	return int(h.Sum32()) & (HubShardCount - 1) // bit mask for power-of-2
}

// shardPrefix returns the hex-encoded shard prefix for a user ID.
// This is embedded in the Redis channel name for pattern-based routing.
func shardPrefix(userID string) string {
	return fmt.Sprintf("%x", shardFor(userID))
}

// userChannel returns the full Redis channel name for a user, including shard prefix.
func userChannel(userID string) string {
	return fmt.Sprintf("%s%s:%s", RedisEventsUserPrefix, shardPrefix(userID), userID)
}

// InitHub creates the sharded hub and starts all workers.
func InitHub(ctx context.Context) {
	hub := &Hub{}
	for i := 0; i < HubShardCount; i++ {
		hub.shards[i] = &hubShard{id: i}
	}
	globalHub = hub

	for i := 0; i < HubShardCount; i++ {
		go hub.shards[i].listenToRedis(ctx)
	}

	// Shutdown watcher
	go func() {
		<-ctx.Done()
		log.Println("[EventHub] Hub shutting down")
		for _, shard := range hub.shards {
			shard.clients.Range(func(key, value any) bool {
				list := value.(*clientList)
				for _, c := range list.entries {
					close(c.Ch)
				}
				shard.clients.Delete(key)
				return true
			})
		}
	}()

	log.Printf("[EventHub] Hub started with %d shards", HubShardCount)
}

// listenToRedis subscribes to this shard's Redis pattern and dispatches
// messages to registered clients.
func (s *hubShard) listenToRedis(ctx context.Context) {
	// Pattern: events:user:{shard_hex}:*
	pattern := fmt.Sprintf("%s%x:*", RedisEventsUserPrefix, s.id)
	pubsub := PSubscribe(ctx, pattern)
	defer pubsub.Close()

	ch := pubsub.Channel()

	log.Printf("[EventHub] Shard %d listening to pattern: %s", s.id, pattern)

	// The shard-specific prefix to strip when extracting the user ID.
	// e.g., "events:user:a:" for shard 10
	prefix := fmt.Sprintf("%s%x:", RedisEventsUserPrefix, s.id)

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			// Extract userID by stripping the shard prefix
			if !strings.HasPrefix(msg.Channel, prefix) {
				continue
			}
			userID := msg.Channel[len(prefix):]
			if userID == "" {
				continue
			}

			// Lock-free dispatch via sync.Map
			value, ok := s.clients.Load(userID)
			if !ok {
				continue
			}
			list := value.(*clientList)
			payload := []byte(msg.Payload)
			for _, client := range list.entries {
				trySend(client, payload)
			}
		}
	}
}

// register adds a client to the correct shard.
func (s *hubShard) register(client *Client) {
	for {
		existing, loaded := s.clients.Load(client.UserID)
		if loaded {
			old := existing.(*clientList)
			newList := &clientList{
				entries: append(old.entries, client),
			}
			if s.clients.CompareAndSwap(client.UserID, old, newList) {
				break
			}
			// CAS failed -- another goroutine modified the list; retry
		} else {
			newList := &clientList{entries: []*Client{client}}
			if _, swapped := s.clients.LoadOrStore(client.UserID, newList); !swapped {
				break
			}
			// Another goroutine stored first; retry with Load path
		}
	}
}

// unregister removes a client from its shard and closes the channel.
func (s *hubShard) unregister(client *Client) {
	for {
		existing, ok := s.clients.Load(client.UserID)
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
			if s.clients.CompareAndDelete(client.UserID, old) {
				break
			}
		} else {
			newList := &clientList{entries: newEntries}
			if s.clients.CompareAndSwap(client.UserID, old, newList) {
				break
			}
		}
		// CAS failed; retry
	}
}

// --- Public API (unchanged signatures from Phase 1) ---

// SendToUser publishes a message to a specific user's sharded Redis channel.
func SendToUser(sub string, msg []byte) {
	channel := userChannel(sub)
	if err := PublishRaw(channel, msg); err != nil {
		log.Printf("[EventHub] Failed to send to user %s: %v", sub, err)
	}
}

// SendToUsers publishes a message to multiple users' sharded Redis channels
// in a single pipeline round-trip.
func SendToUsers(subs []string, msg []byte) {
	if len(subs) == 0 {
		return
	}

	channels := make([]string, len(subs))
	for i, sub := range subs {
		channels[i] = userChannel(sub)
	}

	if errCount := PublishBatch(channels, msg); errCount > 0 {
		log.Printf("[EventHub] Failed to send to %d/%d users", errCount, len(subs))
	}
}

// RegisterClient adds an authenticated client to the correct hub shard.
func RegisterClient(userID string) *Client {
	shard := shardFor(userID)
	client := &Client{
		UserID: userID,
		Shard:  shard,
		Ch:     make(chan []byte, SSEClientBufferSize),
	}
	globalHub.shards[shard].register(client)
	globalHub.clientCount.Add(1)
	return client
}

// UnregisterClient removes a client from its hub shard.
func UnregisterClient(client *Client) {
	globalHub.shards[client.Shard].unregister(client)
	globalHub.clientCount.Add(-1)
}

// ClientCount returns the total number of connected SSE clients.
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
