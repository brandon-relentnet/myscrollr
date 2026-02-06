package main

import (
	"bufio"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
)

// StreamEvents handles Server-Sent Events (SSE)
// @Summary Real-time event stream
// @Description Server-Sent Events endpoint for trades and games updates
// @Tags Stream
// @Produce text/event-stream
// @Router /events [get]
func StreamEvents(c *fiber.Ctx) error {
	// Set headers for SSE
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")

	// Register this client
	messageChan := RegisterClient()
	
	// Create a unique ID for logging
	clientID := c.IP()
	// Only log connection if verbose or unique
	log.Printf("[SSE] Client connected: %s", clientID)

	// Use fasthttp's streaming body
	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(15 * time.Second) // Heartbeat every 15s
		defer ticker.Stop()
		defer UnregisterClient(messageChan)
		
		// Send initial retry interval (3 seconds)
		fmt.Fprintf(w, "retry: 3000\n\n")
		w.Flush()

		for {
			select {
			case msg, ok := <-messageChan:
				if !ok {
					return
				}
				// Format: "data: <json>\n\n"
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if err := w.Flush(); err != nil {
					return // Client disconnected
				}

			case <-ticker.C:
				// Heartbeat (comment) to keep connection alive
				fmt.Fprintf(w, ": ping\n\n")
				if err := w.Flush(); err != nil {
					return // Client disconnected
				}
			}
		}
	}))

	return nil
}
