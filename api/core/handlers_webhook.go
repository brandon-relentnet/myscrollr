package core

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
)

// HandleSequinWebhook receives CDC events from Sequin and routes them
// to the correct per-user Redis channels based on table and subscription sets.
//
// @Summary Receive Sequin CDC events
// @Description Webhook for Sequin to push database changes (authenticated, per-user routing)
// @Tags Webhooks
// @Accept json
// @Produce json
// @Router /webhooks/sequin [post]
func HandleSequinWebhook(c *fiber.Ctx) error {
	// 1. Verify webhook secret (Sequin sends Authorization header)
	secret := os.Getenv("SEQUIN_WEBHOOK_SECRET")
	if secret != "" {
		authHeader := c.Get("Authorization")
		expected := "Bearer " + secret
		if authHeader != expected {
			log.Printf("[Sequin] Webhook auth failed")
			return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{Status: "unauthorized", Error: "Unauthorized"})
		}
	}

	// 2. Parse payload — Sequin may send batched or single records
	body := c.Body()
	records := parseCDCRecords(body)
	if len(records) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{Status: "error", Error: "No valid CDC records"})
	}

	// 3. Route each record to the correct users
	ctx := context.Background()
	for _, record := range records {
		routeCDCRecord(ctx, record)
	}

	return c.SendStatus(fiber.StatusOK)
}

// parseCDCRecords handles both batched {"data":[...]} and single record formats.
func parseCDCRecords(body []byte) []integration.CDCRecord {
	// Try batched format first: {"data": [...]}
	var batched struct {
		Data []integration.CDCRecord `json:"data"`
	}
	if err := json.Unmarshal(body, &batched); err == nil && len(batched.Data) > 0 {
		return batched.Data
	}

	// Try single record format
	var single integration.CDCRecord
	if err := json.Unmarshal(body, &single); err == nil && single.Metadata.TableName != "" {
		return []integration.CDCRecord{single}
	}

	return nil
}

// routeCDCRecord inspects the table name and routes the record to subscribed users.
// Core tables (user_preferences, user_streams) are handled directly.
// All other tables are delegated to the integration registry.
func routeCDCRecord(ctx context.Context, rec integration.CDCRecord) {
	table := rec.Metadata.TableName

	// Wrap the single record in the envelope format clients expect: {"data":[{...}]}
	envelope := map[string]interface{}{
		"data": []interface{}{map[string]interface{}{
			"action":   rec.Action,
			"record":   rec.Record,
			"changes":  rec.Changes,
			"metadata": rec.Metadata,
		}},
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		log.Printf("[Sequin] Failed to marshal envelope for table %s: %v", table, err)
		return
	}

	// Core tables handled directly
	switch table {
	case "user_preferences":
		RouteToRecordOwner(rec.Record, "logto_sub", payload)
		return
	case "user_streams":
		RouteToRecordOwner(rec.Record, "logto_sub", payload)
		return
	}

	// Delegate to integrations that implement CDCHandler
	for _, intg := range IntegrationRegistry {
		h, ok := intg.(integration.CDCHandler)
		if !ok {
			continue
		}
		if h.HandlesTable(table) {
			if err := h.RouteCDCRecord(ctx, rec, payload); err != nil {
				log.Printf("[Sequin] Integration %s failed to route %s CDC: %v", intg.Name(), table, err)
			}
			return
		}
	}

	// Unknown table — silently ignore
}
