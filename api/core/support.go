package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ===== Support ticket types =====

type SupportTicketRequest struct {
	Subject          string                 `json:"subject"`
	Description      string                 `json:"description"`
	WhatWentWrong    string                 `json:"what_went_wrong"`
	ExpectedBehavior string                 `json:"expected_behavior,omitempty"`
	Frequency        string                 `json:"frequency"`
	Diagnostics      map[string]interface{} `json:"diagnostics,omitempty"`
	Attachments      []TicketAttachment     `json:"attachments,omitempty"`
	Email            string                 `json:"email,omitempty"`
	Name             string                 `json:"name,omitempty"`
}

type TicketAttachment struct {
	Filename string `json:"filename"`
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type osTicketPayload struct {
	Name        string                    `json:"name"`
	Email       string                    `json:"email"`
	Subject     string                    `json:"subject"`
	Message     string                    `json:"message"`
	TopicID     string                    `json:"topicId,omitempty"`
	Attachments []osTicketAttachmentEntry `json:"attachments,omitempty"`
}

type osTicketAttachmentEntry struct {
	Filename string `json:"name"`
	MimeType string `json:"type"`
	Data     string `json:"data"`
}

// ===== Per-user rate limiting =====

var (
	supportRateMu    sync.Mutex
	supportRateMap   = make(map[string]time.Time)
	supportRateLimit = 1 * time.Minute
)

func checkSupportRateLimit(userID string) bool {
	supportRateMu.Lock()
	defer supportRateMu.Unlock()

	if last, ok := supportRateMap[userID]; ok {
		if time.Since(last) < supportRateLimit {
			return false
		}
	}
	supportRateMap[userID] = time.Now()
	return true
}

// ===== Handler =====

func HandleSubmitSupportTicket(c *fiber.Ctx) error {
	setCORSHeaders(c)

	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "error",
			Error:  "Authentication required",
		})
	}

	if !checkSupportRateLimit(userID) {
		return c.Status(fiber.StatusTooManyRequests).JSON(ErrorResponse{
			Status: "error",
			Error:  "Please wait before submitting another ticket",
		})
	}

	var req SupportTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	if strings.TrimSpace(req.WhatWentWrong) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Description of what went wrong is required",
		})
	}

	// Determine user identity (email is set by LogtoAuth middleware in c.Locals)
	email, _ := c.Locals("user_email").(string)
	if email == "" {
		email = req.Email
	}
	if email == "" {
		email = "anonymous@scrollr.user"
	}

	name := req.Name
	if name == "" {
		parts := strings.SplitN(email, "@", 2)
		name = parts[0]
	}

	// Build subject
	subject := req.Subject
	if subject == "" {
		what := strings.TrimSpace(req.WhatWentWrong)
		if len(what) > 80 {
			what = what[:80] + "..."
		}
		subject = fmt.Sprintf("Bug Report: %s", what)
	}

	// Build HTML message body
	var body strings.Builder
	body.WriteString("<h3>What were you trying to do?</h3>")
	body.WriteString(fmt.Sprintf("<p>%s</p>", escapeHTML(req.Description)))
	body.WriteString("<h3>What went wrong?</h3>")
	body.WriteString(fmt.Sprintf("<p>%s</p>", escapeHTML(req.WhatWentWrong)))
	if req.ExpectedBehavior != "" {
		body.WriteString("<h3>What did you expect to happen instead?</h3>")
		body.WriteString(fmt.Sprintf("<p>%s</p>", escapeHTML(req.ExpectedBehavior)))
	}
	if req.Frequency != "" {
		body.WriteString(fmt.Sprintf("<p><strong>Frequency:</strong> %s</p>", escapeHTML(req.Frequency)))
	}

	// Append diagnostics as collapsible block
	if req.Diagnostics != nil {
		diagJSON, err := json.MarshalIndent(req.Diagnostics, "", "  ")
		if err == nil {
			body.WriteString("<details><summary><strong>System Diagnostics</strong></summary>")
			body.WriteString(fmt.Sprintf("<pre>%s</pre>", escapeHTML(string(diagJSON))))
			body.WriteString("</details>")
		}
	}

	// Build OS Ticket payload
	payload := osTicketPayload{
		Name:    name,
		Email:   email,
		Subject: subject,
		Message: fmt.Sprintf("data:text/html;charset=utf-8,%s", body.String()),
	}

	topicID := os.Getenv("OSTICKET_TOPIC_ID")
	if topicID != "" {
		payload.TopicID = topicID
	}

	// Forward attachments
	for _, att := range req.Attachments {
		payload.Attachments = append(payload.Attachments, osTicketAttachmentEntry{
			Filename: att.Filename,
			MimeType: att.MimeType,
			Data:     att.Data,
		})
	}

	// POST to OS Ticket
	osTicketURL := os.Getenv("OSTICKET_URL")
	apiKey := os.Getenv("OSTICKET_API_KEY")
	if osTicketURL == "" || apiKey == "" {
		log.Println("[Support] OSTICKET_URL or OSTICKET_API_KEY not configured")
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Support ticket system is not configured",
		})
	}

	ticketURL := strings.TrimSuffix(osTicketURL, "/") + "/api/tickets.json"

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[Support] Failed to marshal OS Ticket payload: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to prepare ticket",
		})
	}

	client := &http.Client{Timeout: 15 * time.Second}
	httpReq, err := http.NewRequest("POST", ticketURL, bytes.NewReader(payloadBytes))
	if err != nil {
		log.Printf("[Support] Failed to create OS Ticket request: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to submit ticket",
		})
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-API-Key", apiKey)

	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[Support] OS Ticket request failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to reach support system",
		})
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		log.Printf("[Support] OS Ticket returned %d: %s", resp.StatusCode, string(respBody))
		return c.Status(fiber.StatusBadGateway).JSON(ErrorResponse{
			Status: "error",
			Error:  "Support system rejected the ticket",
		})
	}

	log.Printf("[Support] Ticket created for user %s", userID)

	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Bug report submitted successfully",
	})
}

// escapeHTML replaces < > & " with HTML entities.
func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}
