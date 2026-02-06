package main

import (
	"context"
	"log"
	"sync"
)

const ChannelName = "events:broadcast"

// Hub maintains the set of active clients and broadcasts messages to them.
type Hub struct {
	// Registered clients.
	clients map[chan []byte]bool

	// Inbound messages from Redis.
	broadcast chan []byte

	// Register requests from the clients.
	register chan chan []byte

	// Unregister requests from clients.
	unregister chan chan []byte

	lock sync.Mutex
}

var globalHub = &Hub{
	broadcast:  make(chan []byte),
	register:   make(chan chan []byte),
	unregister: make(chan chan []byte),
	clients:    make(map[chan []byte]bool),
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	// Start listening to Redis in the background
	go h.listenToRedis()

	log.Println("[EventHub] Hub started and listening for clients")

	for {
		select {
		case client := <-h.register:
			h.lock.Lock()
			h.clients[client] = true
			h.lock.Unlock()

		case client := <-h.unregister:
			h.lock.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client)
			}
			h.lock.Unlock()

		case message := <-h.broadcast:
			h.lock.Lock()
			for client := range h.clients {
				select {
				case client <- message:
				default:
					// If client buffer is full, we skip this message for them
					// to prevent blocking the hub.
				}
			}
			h.lock.Unlock()
		}
	}
}

func (h *Hub) listenToRedis() {
	ctx := context.Background()
	pubsub := Subscribe(ctx, ChannelName)
	defer pubsub.Close()

	ch := pubsub.Channel()

	log.Println("[EventHub] Listening to Redis channel:", ChannelName)

	for msg := range ch {
		h.broadcast <- []byte(msg.Payload)
	}
}

// InitHub starts the global event hub
func InitHub() {
	go globalHub.Run()
}

// Broadcast sends a message to Redis (which will loop back to us and other replicas)
func Broadcast(payload interface{}) {
	go func() {
		if err := Publish(ChannelName, payload); err != nil {
			log.Printf("[EventHub] Failed to broadcast: %v", err)
		}
	}()
}

// RegisterClient adds a client to the hub and returns their channel
func RegisterClient() chan []byte {
	ch := make(chan []byte, 100) // buffer 100 messages to be safe
	globalHub.register <- ch
	return ch
}

// UnregisterClient removes a client
func UnregisterClient(ch chan []byte) {
	globalHub.unregister <- ch
}
