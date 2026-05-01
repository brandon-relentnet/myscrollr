package core

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// =============================================================================
// Resend webhook — capture outbound Message-IDs for ticket threading
// =============================================================================
//
// osTicket sends auto-responses + agent replies via Resend. We need
// each outbound Message-ID so the partner-approved AI replies can set
// `In-Reply-To` correctly and thread back into osTicket. This handler
// receives Resend's `email.sent` events, extracts the ticket number
// from the subject, and persists the (ticket, message-id) pair.

// ResendWebhookEvent is a minimal shape — Resend sends more fields,
// but we only care about email.sent and the headers we need for
// Message-ID extraction.
type ResendWebhookEvent struct {
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	Data      struct {
		EmailID   string         `json:"email_id"`
		From      string         `json:"from"`
		To        []string       `json:"to"`
		Subject   string         `json:"subject"`
		Headers   []ResendHeader `json:"headers,omitempty"`
		MessageID string         `json:"message_id,omitempty"`
	} `json:"data"`
}

type ResendHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// ticketNumberInSubject extracts an osTicket-style ticket reference
// from a subject line. osTicket's default outbound subject looks like
// "Re: Your Scrollr ticket [#1247]" or "[#TKT-1247] Subject Here".
// Returns "" if no [#…] reference is found.
var ticketNumberRegex = regexp.MustCompile(`(?i)\[#\s*([A-Z]*-?\d+)\s*\]`)

func ticketNumberInSubject(subject string) string {
	m := ticketNumberRegex.FindStringSubmatch(subject)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// HandleResendWebhook receives email lifecycle events from Resend.
// Verifies the Svix-style signature against RESEND_WEBHOOK_SECRET, then
// for `email.sent` / `email.delivered` events extracts the Message-ID
// and ticket number from the subject and persists for later threading.
//
// Non-ticket emails (no [#…] in subject) are ignored silently. Other
// event types (bounced, complained, …) are also ignored — they're
// useful telemetry but not what this handler is for.
func HandleResendWebhook(c *fiber.Ctx) error {
	secret := os.Getenv("RESEND_WEBHOOK_SECRET")
	if secret == "" {
		log.Println("[ResendWebhook] RESEND_WEBHOOK_SECRET not set; rejecting")
		return c.SendStatus(fiber.StatusServiceUnavailable)
	}

	body := c.Body()
	if len(body) == 0 {
		return c.SendStatus(fiber.StatusBadRequest)
	}

	// Resend uses Svix-style signing. The signature header is
	// `svix-signature` with format "v1,<base64>". Verify HMAC-SHA256
	// over `<svix-id>.<svix-timestamp>.<body>`.
	sigHeader := c.Get("svix-signature")
	svixID := c.Get("svix-id")
	svixTimestamp := c.Get("svix-timestamp")

	if sigHeader == "" || svixID == "" || svixTimestamp == "" {
		// Allow no-sig in dev environments, but log loudly
		if os.Getenv("RESEND_WEBHOOK_DEV") != "true" {
			log.Println("[ResendWebhook] missing svix headers; rejecting")
			return c.SendStatus(fiber.StatusUnauthorized)
		}
		log.Println("[ResendWebhook] DEV mode — bypassing signature check")
	} else {
		if !verifySvixSignature(secret, svixID, svixTimestamp, body, sigHeader) {
			log.Println("[ResendWebhook] signature verification failed")
			return c.SendStatus(fiber.StatusUnauthorized)
		}
	}

	var ev ResendWebhookEvent
	if err := json.Unmarshal(body, &ev); err != nil {
		log.Printf("[ResendWebhook] parse event: %v", err)
		return c.SendStatus(fiber.StatusBadRequest)
	}

	if ev.Type != "email.sent" && ev.Type != "email.delivered" {
		// Other event types (bounced, complained, etc.) — log but don't process
		return c.SendStatus(fiber.StatusOK)
	}

	// Extract Message-ID from headers if present, else use email_id
	var messageID string
	for _, h := range ev.Data.Headers {
		if strings.EqualFold(h.Name, "Message-ID") || strings.EqualFold(h.Name, "Message-Id") {
			messageID = strings.Trim(h.Value, "<>")
			break
		}
	}
	if messageID == "" {
		messageID = ev.Data.MessageID
	}
	if messageID == "" {
		// Fallback: use Resend's internal email_id as the message reference
		messageID = ev.Data.EmailID
	}
	if messageID == "" {
		log.Println("[ResendWebhook] no Message-ID in event; skipping")
		return c.SendStatus(fiber.StatusOK)
	}

	ticketNumber := ticketNumberInSubject(ev.Data.Subject)
	if ticketNumber == "" {
		// Not a ticket-related email; skip silently
		return c.SendStatus(fiber.StatusOK)
	}

	recipient := ""
	if len(ev.Data.To) > 0 {
		recipient = ev.Data.To[0]
	}

	// Determine direction by inspecting recipient + subject + from. Since
	// osTicket auto-responses, partner notifications, and AI replies can
	// all originate from the same support@ address, the from-address
	// alone is not enough to disambiguate. We use:
	//   1. Recipient = SUPPORT_AGENT_EMAIL  -> partner notification
	//   2. Subject starts with "Re: "       -> AI reply (we always prefix Re:)
	//   3. From contains support inbox       -> osTicket auto-response
	//   4. otherwise                         -> unknown
	// This matters for fetchOSTicketMessageIDForReply, which filters
	// strictly to direction='outbound_osticket' to find the In-Reply-To
	// target. Mistagging would thread AI replies against the wrong msg.
	direction := classifyMessageDirection(ev.Data.From, recipient, ev.Data.Subject)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := recordOSTicketMessageID(ctx, ticketNumber, messageID, recipient, direction); err != nil {
		log.Printf("[ResendWebhook] persist failed: %v", err)
		return c.SendStatus(fiber.StatusInternalServerError)
	}

	log.Printf("[ResendWebhook] captured ticket=%s msg-id=%s recipient=%s",
		ticketNumber, messageID, recipient)
	return c.SendStatus(fiber.StatusOK)
}

// classifyMessageDirection looks at recipient, subject, and from to
// decide which direction tag to store with the captured Message-ID.
//
// Why all three? Because in a typical setup the from-address for
// osTicket auto-responses, partner notifications, AND AI replies all
// resolve to the same support@ address. Distinguishing them requires
// the recipient (agent vs user) and the subject pattern (Re: prefix).
//
// Direction values:
//
//   - outbound_partner_notification: recipient matches SUPPORT_AGENT_EMAIL.
//     Our backend sent this internal approval email. Excluded from
//     In-Reply-To lookups.
//   - outbound_ai: subject starts with "Re: " AND recipient is not
//     the support agent. Our backend sent an AI reply to the user.
//   - outbound_osticket: from contains the support inbox AND not
//     classified above. osTicket sent the user an auto-response or
//     status update. These are the messages fetchOSTicketMessageIDForReply
//     filters for when computing In-Reply-To.
//   - unknown: anything else. Recorded for diagnostic visibility but
//     never used for threading.
//
// All env vars are read at runtime so the classifier stays in sync
// with whatever the configmap currently holds.
func classifyMessageDirection(fromAddress, recipient, subject string) string {
	from := strings.ToLower(fromAddress)
	to := strings.ToLower(recipient)
	subj := strings.ToLower(strings.TrimSpace(subject))

	supportFrom := strings.ToLower(getenvOr("OSTICKET_BCC_EMAIL", "support@myscrollr.com"))
	agentEmail := strings.ToLower(os.Getenv("SUPPORT_AGENT_EMAIL"))

	// 1. Partner notification: recipient is the support agent.
	if agentEmail != "" && strings.Contains(to, agentEmail) {
		return "outbound_partner_notification"
	}

	// 2. AI reply: subject begins with "Re: " (we always prefix replies
	// this way; osTicket's auto-response subjects do not).
	if strings.HasPrefix(subj, "re:") {
		return "outbound_ai"
	}

	// 3. osTicket auto-response or status update: from contains support@.
	if supportFrom != "" && strings.Contains(from, supportFrom) {
		return "outbound_osticket"
	}

	log.Printf("[ResendWebhook] could not classify from=%s to=%s subject=%q",
		fromAddress, recipient, subject)
	return "unknown"
}

// getenvOr returns the value of env var key, or fallback if unset/empty.
func getenvOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// verifySvixSignature validates the Svix HMAC-SHA256 signature header
// against the configured webhook secret. Resend sends a space-separated
// list of "v1,<base64>" entries; we accept the request if any entry
// matches. The base64 in the header is *standard* (Svix uses standard
// base64 padding), not URL-safe.
//
// secret is the value from the env var, possibly with the "whsec_"
// prefix Svix prepends. The actual HMAC key is the bytes after the
// prefix, decoded from standard base64 (Svix encodes its raw key into
// the secret string).
func verifySvixSignature(secret, svixID, svixTimestamp string, body []byte, header string) bool {
	rawKey, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		// Some deployments may set the secret as raw bytes already; fall back to that.
		rawKey = []byte(strings.TrimPrefix(secret, "whsec_"))
	}

	toSign := svixID + "." + svixTimestamp + "." + string(body)
	mac := hmac.New(sha256.New, rawKey)
	mac.Write([]byte(toSign))
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	for _, sig := range strings.Split(header, " ") {
		parts := strings.SplitN(sig, ",", 2)
		if len(parts) != 2 || parts[0] != "v1" {
			continue
		}
		if hmac.Equal([]byte(parts[1]), []byte(expected)) {
			return true
		}
	}
	return false
}
