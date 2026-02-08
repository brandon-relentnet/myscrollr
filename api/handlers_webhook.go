package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"

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

// cdcRecord represents a single Sequin CDC event
type cdcRecord struct {
	Action   string                 `json:"action"`
	Record   map[string]interface{} `json:"record"`
	Changes  map[string]interface{} `json:"changes"`
	Metadata struct {
		TableSchema string `json:"table_schema"`
		TableName   string `json:"table_name"`
	} `json:"metadata"`
}

// parseCDCRecords handles both batched {"data":[...]} and single record formats
func parseCDCRecords(body []byte) []cdcRecord {
	// Try batched format first: {"data": [...]}
	var batched struct {
		Data []cdcRecord `json:"data"`
	}
	if err := json.Unmarshal(body, &batched); err == nil && len(batched.Data) > 0 {
		return batched.Data
	}

	// Try single record format
	var single cdcRecord
	if err := json.Unmarshal(body, &single); err == nil && single.Metadata.TableName != "" {
		return []cdcRecord{single}
	}

	return nil
}

// routeCDCRecord inspects the table name and routes the record to subscribed users
func routeCDCRecord(ctx context.Context, rec cdcRecord) {
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

	switch table {
	case "trades":
		routeToStreamSubscribers(ctx, RedisStreamSubscribersPrefix+"finance", payload)

	case "games":
		routeToStreamSubscribers(ctx, RedisStreamSubscribersPrefix+"sports", payload)

	case "rss_items":
		routeToRSSSubscribers(ctx, rec.Record, payload)

	case "user_preferences":
		routeToRecordOwner(rec.Record, "logto_sub", payload)

	case "user_streams":
		routeToRecordOwner(rec.Record, "logto_sub", payload)

	case "yahoo_leagues":
		routeYahooByGuid(ctx, rec.Record, payload)

	case "yahoo_standings":
		routeYahooByLeagueKey(ctx, rec.Record, payload)

	case "yahoo_matchups":
		routeYahooByTeamKey(ctx, rec.Record, payload)

	case "yahoo_rosters":
		routeYahooByTeamKey(ctx, rec.Record, payload)

	default:
		// Unknown table — silently ignore
	}
}

// routeToStreamSubscribers sends a CDC event to all users subscribed to a stream type
func routeToStreamSubscribers(ctx context.Context, setKey string, payload []byte) {
	subs, err := GetSubscribers(ctx, setKey)
	if err != nil {
		log.Printf("[Sequin] Failed to get subscribers for %s: %v", setKey, err)
		return
	}
	for _, sub := range subs {
		SendToUser(sub, payload)
	}
}

// routeToRSSSubscribers sends an rss_items CDC event to users subscribed to that feed URL
func routeToRSSSubscribers(ctx context.Context, record map[string]interface{}, payload []byte) {
	feedURL, ok := record["feed_url"].(string)
	if !ok || feedURL == "" {
		return
	}
	subs, err := GetSubscribers(ctx, RedisRSSSubscribersPrefix+feedURL)
	if err != nil {
		log.Printf("[Sequin] Failed to get RSS subscribers for %s: %v", feedURL, err)
		return
	}
	for _, sub := range subs {
		SendToUser(sub, payload)
	}
}

// routeToRecordOwner sends a CDC event directly to the user identified in the record
func routeToRecordOwner(record map[string]interface{}, field string, payload []byte) {
	sub, ok := record[field].(string)
	if !ok || sub == "" {
		return
	}
	SendToUser(sub, payload)
}

// routeYahooByGuid resolves a yahoo_leagues record's guid to a logto_sub
func routeYahooByGuid(ctx context.Context, record map[string]interface{}, payload []byte) {
	guid, ok := record["guid"].(string)
	if !ok || guid == "" {
		return
	}
	var logtoSub string
	err := dbPool.QueryRow(ctx, "SELECT logto_sub FROM yahoo_users WHERE guid = $1", guid).Scan(&logtoSub)
	if err != nil {
		return // User not found or DB error — skip silently
	}
	SendToUser(logtoSub, payload)
}

// routeYahooByLeagueKey resolves a yahoo_standings record's league_key to a logto_sub
func routeYahooByLeagueKey(ctx context.Context, record map[string]interface{}, payload []byte) {
	leagueKey, ok := record["league_key"].(string)
	if !ok || leagueKey == "" {
		return
	}
	var logtoSub string
	err := dbPool.QueryRow(ctx, `
		SELECT yu.logto_sub FROM yahoo_leagues yl
		JOIN yahoo_users yu ON yl.guid = yu.guid
		WHERE yl.league_key = $1
	`, leagueKey).Scan(&logtoSub)
	if err != nil {
		return
	}
	SendToUser(logtoSub, payload)
}

// routeYahooByTeamKey resolves a yahoo_matchups/yahoo_rosters record's team_key to a logto_sub.
// Team keys follow the format "nfl.l.{league_id}.t.{team_id}" — we extract the league portion.
func routeYahooByTeamKey(ctx context.Context, record map[string]interface{}, payload []byte) {
	teamKey, ok := record["team_key"].(string)
	if !ok || teamKey == "" {
		return
	}

	// Extract league_key from team_key: "nfl.l.12345.t.1" → "nfl.l.12345"
	// Split on ".t." and take the first part
	parts := strings.SplitN(teamKey, ".t.", 2)
	if len(parts) == 0 {
		return
	}
	leagueKey := parts[0]

	var logtoSub string
	err := dbPool.QueryRow(ctx, `
		SELECT yu.logto_sub FROM yahoo_leagues yl
		JOIN yahoo_users yu ON yl.guid = yu.guid
		WHERE yl.league_key = $1
	`, leagueKey).Scan(&logtoSub)
	if err != nil {
		return
	}
	SendToUser(logtoSub, payload)
}
