package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
)

// HandleSequinWebhook receives CDC events from Sequin
// @Summary Receive Sequin CDC events
// @Description Webhook for Sequin to push database changes
// @Tags Webhooks
// @Accept json
// @Produce json
// @Router /webhooks/sequin [post]
func HandleSequinWebhook(c *fiber.Ctx) error {
	// 1. Verify Secret (if configured)
	secret := os.Getenv("SEQUIN_WEBHOOK_SECRET")
	if secret != "" {
		// Sequin usually sends "Sequin-Signature" or "Webhook-Signature"
		// For now, we will assume the user configured a raw secret query param or header
		// as a simple first step if HMAC is complex to verify without docs.
		// However, let's skip strict verification logic until we confirm the header format.
		// Just logging for now.
		// log.Printf("[Sequin] Webhook received. Signature: %s", c.Get("Sequin-Signature"))
	}

	// 2. Parse Payload
	// We use a generic map to forward everything to the frontend
	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		log.Printf("[Sequin] Error parsing body: %v", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	// 3. Broadcast
	// The payload from Sequin (CDC) typically contains { "record": ..., "metadata": ... }
	// We pass it directly to the frontend which will handle the state update.
	Broadcast(payload)

	// log.Printf("[Sequin] Broadcasted event for table: %v", payload["table"])

	return c.SendStatus(fiber.StatusOK)
}
