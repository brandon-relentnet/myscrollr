package core

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// =============================================================================
// Discord interactions handler — POST /webhooks/discord/interactions
// =============================================================================
//
// Discord POSTs all interaction events (slash commands, button clicks,
// modal submissions) to a single endpoint. Each request is signed with
// Ed25519 using the application's signing key. We verify the signature
// before processing, respond inline.
//
// Interaction types we handle:
//   - PING (1)               — Discord verifies the endpoint URL
//   - APPLICATION_COMMAND (2) — slash commands (/inbox, /ticket)
//   - MESSAGE_COMPONENT (3)   — button clicks (Send, Edit, Skip)
//   - MODAL_SUBMIT (5)        — partner submitting an edited reply
//
// Response types we use:
//   - PONG (1)                          — for PING
//   - CHANNEL_MESSAGE_WITH_SOURCE (4)   — visible message
//   - DEFERRED_CHANNEL_MESSAGE (5)      — "thinking..." placeholder
//   - MODAL (9)                         — open a modal
//   - UPDATE_MESSAGE (7)                — edit the message that triggered the interaction
//
// Discord docs: https://discord.com/developers/docs/interactions/receiving-and-responding

// Discord interaction types.
const (
	discordInteractionPing               = 1
	discordInteractionApplicationCommand = 2
	discordInteractionMessageComponent   = 3
	discordInteractionModalSubmit        = 5
)

// Discord interaction response types.
const (
	discordResponsePong                     = 1
	discordResponseChannelMessageWithSource = 4
	discordResponseDeferredChannelMessage   = 5
	discordResponseUpdateMessage            = 7
	discordResponseDeferredUpdateMessage    = 6
	discordResponseModal                    = 9
)

// discordInteractionFlagEphemeral marks a response as visible only to
// the user who triggered it. Used for confirmations and errors so we
// don't clutter the channel.
const discordInteractionFlagEphemeral = 64

// discordInteraction is the part of Discord's interaction payload we
// actually consume. The full schema has many more fields; we ignore them.
type discordInteraction struct {
	ID            string                  `json:"id"`
	Type          int                     `json:"type"`
	Token         string                  `json:"token"`
	ApplicationID string                  `json:"application_id"`
	GuildID       string                  `json:"guild_id"`
	ChannelID     string                  `json:"channel_id"`
	Member        *discordMember          `json:"member"`
	Data          *discordInteractionData `json:"data"`
}

type discordMember struct {
	User *discordUser `json:"user"`
}

type discordUser struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

type discordInteractionData struct {
	// APPLICATION_COMMAND fields
	Name    string                         `json:"name"`
	Options []discordInteractionDataOption `json:"options,omitempty"`
	// MESSAGE_COMPONENT fields
	CustomID      string `json:"custom_id"`
	ComponentType int    `json:"component_type"`
	// MODAL_SUBMIT fields
	Components []discordModalComponentRow `json:"components,omitempty"`
}

type discordInteractionDataOption struct {
	Name  string `json:"name"`
	Type  int    `json:"type"`
	Value string `json:"value"`
}

type discordModalComponentRow struct {
	Type       int                          `json:"type"`
	Components []discordModalComponentInput `json:"components"`
}

type discordModalComponentInput struct {
	Type     int    `json:"type"`
	CustomID string `json:"custom_id"`
	Value    string `json:"value"`
}

// HandleDiscordInteractions verifies the signature, dispatches by
// interaction type, returns the appropriate response.
func HandleDiscordInteractions(c *fiber.Ctx) error {
	cfg, ok := loadDiscordConfig()
	if !ok {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "discord not configured",
		})
	}

	signature := c.Get("X-Signature-Ed25519")
	timestamp := c.Get("X-Signature-Timestamp")
	if signature == "" || timestamp == "" {
		return c.Status(fiber.StatusUnauthorized).SendString("missing signature headers")
	}

	body := c.Body()
	if err := verifyDiscordSignature(cfg.PublicKey, signature, timestamp, body); err != nil {
		log.Printf("[DiscordInteraction] signature verify failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).SendString("invalid signature")
	}

	var interaction discordInteraction
	if err := json.Unmarshal(body, &interaction); err != nil {
		log.Printf("[DiscordInteraction] body parse: %v", err)
		return c.Status(fiber.StatusBadRequest).SendString("malformed body")
	}

	switch interaction.Type {
	case discordInteractionPing:
		return c.JSON(fiber.Map{"type": discordResponsePong})
	case discordInteractionApplicationCommand:
		return handleDiscordSlashCommand(c, &interaction)
	case discordInteractionMessageComponent:
		return handleDiscordButtonClick(c, &interaction)
	case discordInteractionModalSubmit:
		return handleDiscordModalSubmit(c, &interaction)
	default:
		log.Printf("[DiscordInteraction] unknown type %d", interaction.Type)
		return c.Status(fiber.StatusBadRequest).SendString("unknown interaction type")
	}
}

// =============================================================================
// Button clicks — Send / Edit / Skip
// =============================================================================

// handleDiscordButtonClick routes button presses by the action prefix
// in their `custom_id`.
//
// custom_id format: "support_<action>:<draft_id>" where action is
// send / edit / skip.
func handleDiscordButtonClick(c *fiber.Ctx, ix *discordInteraction) error {
	if ix.Data == nil {
		return discordEphemeralResponse(c, "missing data")
	}
	customID := ix.Data.CustomID
	parts := strings.SplitN(customID, ":", 2)
	if len(parts) != 2 {
		return discordEphemeralResponse(c, "malformed custom_id")
	}
	prefix, idStr := parts[0], parts[1]
	draftID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return discordEphemeralResponse(c, "malformed draft id")
	}

	switch prefix {
	case "support_send":
		return handleDiscordSendAction(c, ix, draftID)
	case "support_edit":
		return handleDiscordEditOpenModal(c, ix, draftID)
	case "support_skip":
		return handleDiscordSkipAction(c, ix, draftID)
	default:
		log.Printf("[DiscordInteraction] unknown button prefix %q", prefix)
		return discordEphemeralResponse(c, "unknown action")
	}
}

// handleDiscordSendAction calls the existing approve-and-send flow.
func handleDiscordSendAction(c *fiber.Ctx, ix *discordInteraction, draftID int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	draft, err := loadSupportDraft(ctx, draftID)
	if err != nil {
		log.Printf("[DiscordInteraction] load draft %d: %v", draftID, err)
		return discordEphemeralResponse(c, "Could not load draft.")
	}
	if draft == nil {
		return discordEphemeralResponse(c, "Draft not found (already actioned?).")
	}
	if draft.Status != "pending" {
		return discordEphemeralResponse(c,
			fmt.Sprintf("Draft is `%s` (already actioned).", draft.Status))
	}

	// Atomic decide → approved (no edits). Same call the email
	// approval flow makes for the Send action.
	if err := markDraftDecided(ctx, draftID, "approved", ""); err != nil {
		log.Printf("[DiscordInteraction] markDraftDecided for %d: %v", draftID, err)
		return discordEphemeralResponse(c, "Could not mark draft as approved.")
	}
	// Reload to get the post-mark state (status='approved').
	draft, _ = loadSupportDraft(ctx, draftID)

	// Fire-and-forget the actual reply send. body="" tells
	// sendApprovedReply to use draft.DraftBodyHTML as-is. On success it
	// will markDraftSent; on failure markDraftFailed.
	go func() {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer bgCancel()
		if err := sendApprovedReply(bgCtx, draft, draft.DraftBodyHTML); err != nil {
			log.Printf("[DiscordInteraction] sendApprovedReply for ticket %s: %v",
				draft.TicketNumber, err)
			return
		}
		// On close, archive the Discord thread.
		if draft.ShouldClose {
			if t, err := loadSupportTicketThread(bgCtx, draft.TicketNumber); err == nil && t != nil {
				if err := discordArchiveThread(bgCtx, t.DiscordThreadID); err != nil {
					log.Printf("[DiscordInteraction] archive thread for ticket %s: %v",
						draft.TicketNumber, err)
				} else {
					_ = markSupportTicketThreadArchived(bgCtx, draft.TicketNumber)
				}
			}
		}
	}()

	suffix := ""
	if draft.ShouldClose {
		suffix = " — ticket auto-closing"
	}
	return discordVisibleResponse(c, "✅ Sent to user"+suffix)
}

// handleDiscordEditOpenModal opens a modal so the partner can edit the
// AI's draft before sending. The modal's text-area is pre-filled with
// the current draft body (HTML stripped to plain text since Discord
// modals are plain-text only).
func handleDiscordEditOpenModal(c *fiber.Ctx, ix *discordInteraction, draftID int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	draft, err := loadSupportDraft(ctx, draftID)
	if err != nil {
		log.Printf("[DiscordInteraction] load draft %d: %v", draftID, err)
		return discordEphemeralResponse(c, "Could not load draft.")
	}
	if draft == nil {
		return discordEphemeralResponse(c, "Draft not found.")
	}
	if draft.Status != "pending" {
		return discordEphemeralResponse(c,
			fmt.Sprintf("Draft is `%s` (already actioned).", draft.Status))
	}

	// Convert draft HTML to plain text for the modal's text area.
	prefilled := htmlToPlain(draft.DraftBodyHTML)
	if len(prefilled) > 4000 {
		// Discord text-area max is 4000 chars.
		prefilled = prefilled[:4000]
	}

	resp := fiber.Map{
		"type": discordResponseModal,
		"data": fiber.Map{
			"custom_id": fmt.Sprintf("support_edit_modal:%d", draftID),
			"title":     fmt.Sprintf("Edit reply for #%s", draft.TicketNumber),
			"components": []fiber.Map{
				{
					"type": 1,
					"components": []fiber.Map{
						{
							"type":        4,
							"custom_id":   "edited_body",
							"label":       "Reply body (plain text)",
							"style":       2, // Paragraph
							"value":       prefilled,
							"min_length":  1,
							"max_length":  4000,
							"required":    true,
							"placeholder": "Edit the reply...",
						},
					},
				},
			},
		},
	}
	return c.JSON(resp)
}

// handleDiscordSkipAction marks the draft as skipped.
func handleDiscordSkipAction(c *fiber.Ctx, ix *discordInteraction, draftID int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	draft, err := loadSupportDraft(ctx, draftID)
	if err != nil {
		return discordEphemeralResponse(c, "Could not load draft.")
	}
	if draft == nil {
		return discordEphemeralResponse(c, "Draft not found.")
	}
	if draft.Status != "pending" {
		return discordEphemeralResponse(c,
			fmt.Sprintf("Draft is `%s` (already actioned).", draft.Status))
	}

	if err := markDraftDecided(ctx, draftID, "skipped", ""); err != nil {
		log.Printf("[DiscordInteraction] markDraftDecided (skipped) %d: %v", draftID, err)
		return discordEphemeralResponse(c, "Could not skip draft.")
	}

	return discordVisibleResponse(c, "⏭️ Skipped — draft will not be sent")
}

// =============================================================================
// Modal submit — partner submitted edited reply
// =============================================================================

// handleDiscordModalSubmit processes the modal-submit event from the
// Edit flow. Reads the edited body out of the components array,
// applies it to the draft, and dispatches the reply.
func handleDiscordModalSubmit(c *fiber.Ctx, ix *discordInteraction) error {
	if ix.Data == nil {
		return discordEphemeralResponse(c, "missing data")
	}
	customID := ix.Data.CustomID
	parts := strings.SplitN(customID, ":", 2)
	if len(parts) != 2 || parts[0] != "support_edit_modal" {
		return discordEphemeralResponse(c, "malformed modal custom_id")
	}
	draftID, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return discordEphemeralResponse(c, "malformed draft id")
	}

	// Discord nests modal field values one level deep: components is
	// a list of action rows, each containing one input component.
	var editedBody string
	for _, row := range ix.Data.Components {
		for _, comp := range row.Components {
			if comp.CustomID == "edited_body" {
				editedBody = comp.Value
			}
		}
	}
	editedBody = strings.TrimSpace(editedBody)
	if editedBody == "" {
		return discordEphemeralResponse(c, "Edited body is empty.")
	}

	// Wrap plain-text in basic HTML so the email rendering path doesn't
	// break. Existing pipeline expects HTML.
	editedBodyHTML := plainToHTMLParagraphs(editedBody)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	draft, err := loadSupportDraft(ctx, draftID)
	if err != nil || draft == nil {
		return discordEphemeralResponse(c, "Draft not found.")
	}
	if draft.Status != "pending" {
		return discordEphemeralResponse(c,
			fmt.Sprintf("Draft is `%s` (already actioned).", draft.Status))
	}

	// Atomic decide → edited with the edited body persisted on the row.
	if err := markDraftDecided(ctx, draftID, "edited", editedBodyHTML); err != nil {
		log.Printf("[DiscordInteraction] markDraftDecided (edited) %d: %v", draftID, err)
		return discordEphemeralResponse(c, "Could not save edits.")
	}
	draft, _ = loadSupportDraft(ctx, draftID)

	go func() {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer bgCancel()
		if err := sendApprovedReply(bgCtx, draft, editedBodyHTML); err != nil {
			log.Printf("[DiscordInteraction] sendApprovedReply (edited) for ticket %s: %v",
				draft.TicketNumber, err)
		}
		if draft.ShouldClose {
			if t, err := loadSupportTicketThread(bgCtx, draft.TicketNumber); err == nil && t != nil {
				_ = discordArchiveThread(bgCtx, t.DiscordThreadID)
				_ = markSupportTicketThreadArchived(bgCtx, draft.TicketNumber)
			}
		}
	}()

	return discordVisibleResponse(c, "✏️ Edited and sent")
}

// =============================================================================
// Slash commands — /inbox and /ticket <number>
// =============================================================================

func handleDiscordSlashCommand(c *fiber.Ctx, ix *discordInteraction) error {
	if ix.Data == nil {
		return discordEphemeralResponse(c, "missing data")
	}
	switch ix.Data.Name {
	case "inbox":
		return handleDiscordInboxCommand(c, ix)
	case "ticket":
		return handleDiscordTicketCommand(c, ix)
	default:
		return discordEphemeralResponse(c,
			fmt.Sprintf("Unknown command: %s", ix.Data.Name))
	}
}

// handleDiscordInboxCommand lists the 5 most recent pending drafts.
func handleDiscordInboxCommand(c *fiber.Ctx, ix *discordInteraction) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const q = `
		SELECT id, ticket_number, ai_summary, ai_priority, created_at
		FROM support_drafts
		WHERE status = 'pending'
		ORDER BY created_at DESC
		LIMIT 5
	`
	rows, err := DBPool.Query(ctx, q)
	if err != nil {
		log.Printf("[DiscordInteraction] /inbox query: %v", err)
		return discordEphemeralResponse(c, "Database query failed.")
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var (
			id           int64
			ticketNumber string
			summary      *string
			priority     *string
			createdAt    time.Time
		)
		if err := rows.Scan(&id, &ticketNumber, &summary, &priority, &createdAt); err != nil {
			continue
		}
		summaryText := "(no summary)"
		if summary != nil && *summary != "" {
			summaryText = *summary
		}
		priorityText := ""
		if priority != nil && *priority != "" {
			priorityText = " · `" + *priority + "`"
		}
		age := time.Since(createdAt).Round(time.Minute)
		lines = append(lines,
			fmt.Sprintf("• **#%s**%s — %s _(%s ago)_",
				ticketNumber, priorityText, summaryText, age))
	}
	if err := rows.Err(); err != nil {
		log.Printf("[DiscordInteraction] /inbox rows: %v", err)
	}

	if len(lines) == 0 {
		return discordEphemeralResponse(c, "📭 Inbox is empty — no pending drafts.")
	}

	content := "**Pending support drafts:**\n" + strings.Join(lines, "\n")
	return discordEphemeralResponse(c, content)
}

// handleDiscordTicketCommand shows the latest draft for a specific
// ticket number.
func handleDiscordTicketCommand(c *fiber.Ctx, ix *discordInteraction) error {
	if ix.Data == nil {
		return discordEphemeralResponse(c, "missing data")
	}
	var ticketNumber string
	for _, opt := range ix.Data.Options {
		if opt.Name == "number" {
			ticketNumber = strings.TrimSpace(opt.Value)
		}
	}
	if ticketNumber == "" {
		return discordEphemeralResponse(c, "Missing `number` option.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const q = `
		SELECT id, ticket_number, user_email, user_name, original_subject,
			   user_message_html, draft_body_html, ai_summary, ai_category,
			   ai_priority, ai_channel, ai_duplicate_of, ai_confidence, status,
			   edited_body_html, decided_at, sent_at, created_at, should_close
		FROM support_drafts
		WHERE ticket_number = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var d SupportDraft
	var userName, userMsg, summary, category, priority, channel, dupOf, confidence, editedBody *string
	err := DBPool.QueryRow(ctx, q, ticketNumber).Scan(
		&d.ID, &d.TicketNumber, &d.UserEmail, &userName, &d.OriginalSubject,
		&userMsg, &d.DraftBodyHTML, &summary, &category, &priority, &channel,
		&dupOf, &confidence, &d.Status, &editedBody,
		&d.DecidedAt, &d.SentAt, &d.CreatedAt, &d.ShouldClose,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return discordEphemeralResponse(c,
				fmt.Sprintf("No draft found for ticket #%s.", ticketNumber))
		}
		log.Printf("[DiscordInteraction] /ticket query: %v", err)
		return discordEphemeralResponse(c, "Database query failed.")
	}
	// Hydrate
	if userName != nil {
		d.UserName = *userName
	}
	if userMsg != nil {
		d.UserMessageHTML = *userMsg
	}
	if summary != nil {
		d.AISummary = *summary
	}
	if category != nil {
		d.AICategory = *category
	}
	if priority != nil {
		d.AIPriority = *priority
	}
	if channel != nil {
		d.AIChannel = *channel
	}
	if dupOf != nil {
		d.AIDuplicateOf = *dupOf
	}
	if confidence != nil {
		d.AIConfidence = *confidence
	}

	content := buildDraftMessageContent(&d) +
		fmt.Sprintf("\n\n_Status: `%s`_", d.Status)

	// Buttons only if still pending.
	var components []DiscordActionRow
	if d.Status == "pending" {
		components = buildDraftActionButtons(d.ID)
	}

	resp := fiber.Map{
		"type": discordResponseChannelMessageWithSource,
		"data": fiber.Map{
			"content":          content,
			"components":       components,
			"flags":            discordInteractionFlagEphemeral,
			"allowed_mentions": fiber.Map{"parse": []string{}},
		},
	}
	return c.JSON(resp)
}

// =============================================================================
// Response helpers
// =============================================================================

// discordEphemeralResponse returns an ephemeral message (visible only
// to the user who triggered the interaction).
func discordEphemeralResponse(c *fiber.Ctx, content string) error {
	return c.JSON(fiber.Map{
		"type": discordResponseChannelMessageWithSource,
		"data": fiber.Map{
			"content":          content,
			"flags":            discordInteractionFlagEphemeral,
			"allowed_mentions": fiber.Map{"parse": []string{}},
		},
	})
}

// discordVisibleResponse posts a message visible to everyone in the
// thread/channel where the interaction happened.
func discordVisibleResponse(c *fiber.Ctx, content string) error {
	return c.JSON(fiber.Map{
		"type": discordResponseChannelMessageWithSource,
		"data": fiber.Map{
			"content":          content,
			"allowed_mentions": fiber.Map{"parse": []string{}},
		},
	})
}

// plainToHTMLParagraphs converts user-typed plain text into very basic
// HTML so the existing email-rendering path can handle it. Each
// blank-line-separated block becomes a <p>; line-breaks within a block
// become <br>.
func plainToHTMLParagraphs(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	paragraphs := strings.Split(s, "\n\n")
	var out strings.Builder
	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// Escape minimal HTML so user text is rendered safely.
		p = strings.ReplaceAll(p, "&", "&amp;")
		p = strings.ReplaceAll(p, "<", "&lt;")
		p = strings.ReplaceAll(p, ">", "&gt;")
		p = strings.ReplaceAll(p, "\n", "<br>")
		out.WriteString("<p>")
		out.WriteString(p)
		out.WriteString("</p>")
	}
	return out.String()
}

// readBody is a small helper to keep handlers symmetric. Currently
// unused but kept for future modal-or-attachment paths that may need
// raw body access.
func readBody(c *fiber.Ctx) ([]byte, error) {
	r := c.Context().RequestBodyStream()
	if r == nil {
		return c.Body(), nil
	}
	return io.ReadAll(r)
}
