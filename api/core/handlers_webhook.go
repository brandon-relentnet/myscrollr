package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
)

// CDCRecord represents a single Change Data Capture record from Sequin.
type CDCRecord struct {
	Action   string                 `json:"action"`
	Record   map[string]interface{} `json:"record"`
	Changes  map[string]interface{} `json:"changes"`
	Metadata struct {
		TableSchema string `json:"table_schema"`
		TableName   string `json:"table_name"`
	} `json:"metadata"`
}

var cdcClient = &http.Client{
	Timeout: 10 * time.Second,
}

// HandleSequinWebhook processes incoming CDC events from Sequin.
//
// @Summary Receive Sequin CDC events
// @Description Webhook for Sequin to push database changes (authenticated, per-user routing)
// @Tags Webhooks
// @Accept json
// @Produce json
// @Router /webhooks/sequin [post]
func HandleSequinWebhook(c *fiber.Ctx) error {
	// Verify webhook secret
	secret := os.Getenv("SEQUIN_WEBHOOK_SECRET")
	if secret != "" {
		auth := c.Get("Authorization")
		if auth != "Bearer "+secret {
			return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
				Status: "unauthorized",
				Error:  "Invalid webhook secret",
			})
		}
	}

	records, err := parseCDCRecords(c.Body())
	if err != nil {
		log.Printf("[Sequin] Failed to parse CDC records: %v", err)
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid CDC payload",
		})
	}

	ctx := context.Background()
	for _, rec := range records {
		routeCDCRecord(ctx, rec)
	}

	return c.JSON(fiber.Map{"status": "ok", "processed": len(records)})
}

func parseCDCRecords(body []byte) ([]CDCRecord, error) {
	// Try batched format: {"data": [...]}
	var batched struct {
		Data []CDCRecord `json:"data"`
	}
	if err := json.Unmarshal(body, &batched); err == nil && len(batched.Data) > 0 {
		return batched.Data, nil
	}

	// Try single record
	var single CDCRecord
	if err := json.Unmarshal(body, &single); err == nil && single.Metadata.TableName != "" {
		return []CDCRecord{single}, nil
	}

	return nil, fmt.Errorf("unrecognized CDC payload format")
}

func routeCDCRecord(ctx context.Context, rec CDCRecord) {
	table := rec.Metadata.TableName

	// Build the envelope payload that will be sent to users via SSE
	envelope := map[string]interface{}{
		"data": []map[string]interface{}{
			{
				"action":   rec.Action,
				"record":   rec.Record,
				"changes":  rec.Changes,
				"metadata": rec.Metadata,
			},
		},
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		log.Printf("[Sequin] Failed to marshal payload for table %s: %v", table, err)
		return
	}

	// Handle core-owned tables directly
	switch table {
	case "user_preferences":
		RouteToRecordOwner(rec.Record, "logto_sub", payload)
		return
	case "user_channels":
		RouteToRecordOwner(rec.Record, "logto_sub", payload)
		return
	}

	// Look up which channel handles this table
	intg := GetChannelForTable(table)
	if intg == nil {
		// Unknown table — silently ignore
		return
	}

	// Forward CDC records to channel service
	users, err := forwardCDCToChannel(ctx, intg, []CDCRecord{rec})
	if err != nil {
		log.Printf("[Sequin] Failed to forward CDC for table %s to channel %s: %v", table, intg.Name, err)
		return
	}

	// Publish the SSE payload to all target users in a single pipeline round-trip
	SendToUsers(users, payload)
}

// forwardCDCToChannel sends CDC records to a channel's /internal/cdc endpoint
// and returns the list of user subs to route the event to.
func forwardCDCToChannel(ctx context.Context, intg *ChannelInfo, records []CDCRecord) ([]string, error) {
	reqBody, err := json.Marshal(map[string]interface{}{
		"records": records,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal error: %w", err)
	}

	url := intg.InternalURL + "/internal/cdc"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("request creation error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := cdcClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read error: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Users []string `json:"users"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("unmarshal error: %w", err)
	}

	return result.Users, nil
}
