package main

import (
	"bufio"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
)

// GetActiveViewers returns the count of connected SSE clients
func GetActiveViewers(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"count": ClientCount()})
}

// StreamEvents handles authenticated Server-Sent Events (SSE).
// Authentication is via ?token= query parameter since EventSource
// does not support custom headers.
//
// @Summary Real-time event stream (authenticated)
// @Description Server-Sent Events endpoint for per-user CDC updates
// @Tags Stream
// @Produce text/event-stream
// @Param token query string true "JWT access token"
// @Router /events [get]
func StreamEvents(c *fiber.Ctx) error {
	// 1. Extract token from query param
	tokenString := c.Query("token")
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Missing token parameter",
		})
	}

	// 2. Validate JWT and get user ID
	userID, _, err := ValidateToken(tokenString)
	if err != nil {
		log.Printf("[SSE] Auth failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Invalid or expired token",
		})
	}

	// 3. Set headers for SSE
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")

	// 4. Register this authenticated client
	client := RegisterClient(userID)

	log.Printf("[SSE] Client connected: user=%s ip=%s", userID, c.IP())

	// 5. Stream events to the client
	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(SSEHeartbeatInterval)
		defer ticker.Stop()
		defer UnregisterClient(client)

		// Send initial retry interval (3 seconds)
		fmt.Fprintf(w, "retry: %d\n\n", SSERetryIntervalMs)
		w.Flush()

		for {
			select {
			case msg, ok := <-client.ch:
				if !ok {
					return
				}
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if err := w.Flush(); err != nil {
					return // Client disconnected
				}

			case <-ticker.C:
				// Heartbeat to keep connection alive
				fmt.Fprintf(w, ": ping\n\n")
				if err := w.Flush(); err != nil {
					return // Client disconnected
				}
			}
		}
	}))

	return nil
}
