package core

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// =============================================================================
// Discord integration — REST client + signature verification
// =============================================================================
//
// Scrollr's support-triage pipeline uses Discord as the partner-facing
// UI for approving / editing / skipping AI-drafted replies. Today we ALSO
// notify via email; Discord runs in addition for now.
//
// All Discord logic lives in core-api (no separate bot service). Two
// directions of traffic:
//
//   Outbound (us → Discord): REST API calls authenticated with bot token
//     - POST /api/v10/channels/{channel_id}/threads     (create thread)
//     - POST /api/v10/channels/{thread_id}/messages     (post in thread)
//     - PATCH /api/v10/channels/{thread_id}             (archive thread)
//     - PUT /api/v10/applications/{app_id}/guilds/{guild_id}/commands
//
//   Inbound (Discord → us): HTTP POSTs to /webhooks/discord/interactions
//     verified via Ed25519 signatures (DISCORD_PUBLIC_KEY).
//
// Failure mode is fail-open: if Discord calls fail, we log and continue.
// The email notification path stays active as a backup.
//
// See docs/superpowers/specs/2026-05-01-discord-triage-integration-design.md

const (
	discordAPIBase     = "https://discord.com/api/v10"
	discordHTTPTimeout = 10 * time.Second
)

// DiscordConfig groups the env-driven config in one struct so callers
// can quick-check whether Discord integration is enabled (any missing
// required field => disabled, log once at startup).
type DiscordConfig struct {
	BotToken         string // Bot token from Discord application
	PublicKey        string // Hex-encoded Ed25519 public key for verifying inbound interactions
	ApplicationID    string // Discord application snowflake ID
	GuildID          string // Discord server (guild) snowflake ID
	SupportChannelID string // Channel in which support threads are created
}

// loadDiscordConfig reads env vars and returns a config.
// Returns (cfg, true) when ALL required fields are populated; otherwise
// (zero-value, false). Callers should treat false as "Discord disabled".
func loadDiscordConfig() (DiscordConfig, bool) {
	cfg := DiscordConfig{
		BotToken:         os.Getenv("DISCORD_BOT_TOKEN"),
		PublicKey:        os.Getenv("DISCORD_PUBLIC_KEY"),
		ApplicationID:    os.Getenv("DISCORD_APPLICATION_ID"),
		GuildID:          os.Getenv("DISCORD_GUILD_ID"),
		SupportChannelID: os.Getenv("DISCORD_SUPPORT_CHANNEL_ID"),
	}
	if cfg.BotToken == "" || cfg.PublicKey == "" ||
		cfg.ApplicationID == "" || cfg.GuildID == "" ||
		cfg.SupportChannelID == "" {
		return DiscordConfig{}, false
	}
	return cfg, true
}

// notifyMode returns the SUPPORT_NOTIFY env var value. Defaults to
// "both" so existing email notifications keep flowing during rollout.
//
// Returned values: "discord", "email", "both".
func notifyMode() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SUPPORT_NOTIFY")))
	switch v {
	case "discord", "email", "both":
		return v
	default:
		return "both"
	}
}

// shouldNotifyEmail returns true when we should send the email
// notification for this draft (per SUPPORT_NOTIFY).
func shouldNotifyEmail() bool {
	m := notifyMode()
	return m == "email" || m == "both"
}

// shouldNotifyDiscord returns true when Discord integration is enabled
// AND the SUPPORT_NOTIFY mode includes Discord.
func shouldNotifyDiscord() bool {
	if _, ok := loadDiscordConfig(); !ok {
		return false
	}
	m := notifyMode()
	return m == "discord" || m == "both"
}

// =============================================================================
// Outbound Discord REST helpers
// =============================================================================

// discordHTTPClient is shared across requests.
var discordHTTPClient = &http.Client{Timeout: discordHTTPTimeout}

// discordRequest performs an authenticated REST call to Discord.
// Returns the response body bytes and HTTP status code.
//
// All callers should treat non-2xx as failure and log + continue (fail-open).
func discordRequest(ctx context.Context, method, path string, body interface{}) ([]byte, int, error) {
	cfg, ok := loadDiscordConfig()
	if !ok {
		return nil, 0, errors.New("discord not configured")
	}

	var bodyReader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(buf)
	}

	url := discordAPIBase + path
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bot "+cfg.BotToken)
	req.Header.Set("User-Agent", "ScrollrSupportBot (myscrollr.com, 1.0)")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := discordHTTPClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("discord request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}
	return respBody, resp.StatusCode, nil
}

// =============================================================================
// Thread + message primitives
// =============================================================================

// DiscordThread is the minimal subset of Discord's Channel object we
// need from thread-creation responses.
type DiscordThread struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	GuildID  string `json:"guild_id"`
	ParentID string `json:"parent_id"`
}

// discordCreateThread starts a public thread WITHOUT a starting message
// in the support channel.
//
// Returns the new thread's ID. Discord's "thread without a message"
// endpoint requires the `auto_archive_duration` field; 4320 = 3 days.
func discordCreateThread(ctx context.Context, channelID, name string) (*DiscordThread, error) {
	if len(name) > 100 {
		// Discord's hard limit on thread names is 100 chars.
		name = name[:100]
	}
	body := map[string]interface{}{
		"name":                  name,
		"type":                  11, // PUBLIC_THREAD
		"auto_archive_duration": 4320,
	}
	respBody, status, err := discordRequest(ctx, http.MethodPost,
		"/channels/"+channelID+"/threads", body)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("discord create thread: status %d body %s", status, string(respBody))
	}
	var t DiscordThread
	if err := json.Unmarshal(respBody, &t); err != nil {
		return nil, fmt.Errorf("parse thread response: %w", err)
	}
	return &t, nil
}

// DiscordMessageButton is a minimal action-row button.
type DiscordMessageButton struct {
	Type     int    `json:"type"`  // 2 = Button
	Style    int    `json:"style"` // 1=primary, 2=secondary, 3=success, 4=danger, 5=link
	Label    string `json:"label"`
	CustomID string `json:"custom_id,omitempty"` // for non-link buttons
	Emoji    *struct {
		Name string `json:"name"`
	} `json:"emoji,omitempty"`
}

// DiscordActionRow groups buttons.
type DiscordActionRow struct {
	Type       int                    `json:"type"` // 1 = ACTION_ROW
	Components []DiscordMessageButton `json:"components"`
}

// discordPostMessage posts a message in a channel or thread, optionally
// with components (buttons). Returns the new message's ID.
//
// channelOrThreadID is either a channel ID or thread ID — Discord
// treats threads as channels for the purpose of posting.
func discordPostMessage(ctx context.Context, channelOrThreadID, content string, components []DiscordActionRow) (string, error) {
	body := map[string]interface{}{
		"content":          content,
		"allowed_mentions": map[string]interface{}{"parse": []string{}}, // suppress @ mentions
	}
	if len(components) > 0 {
		body["components"] = components
	}
	respBody, status, err := discordRequest(ctx, http.MethodPost,
		"/channels/"+channelOrThreadID+"/messages", body)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("discord post message: status %d body %s", status, string(respBody))
	}
	var m struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respBody, &m); err != nil {
		return "", fmt.Errorf("parse message response: %w", err)
	}
	return m.ID, nil
}

// discordArchiveThread sets `archived: true` on a thread. No-op if
// thread doesn't exist (returns nil so callers don't crash on race).
func discordArchiveThread(ctx context.Context, threadID string) error {
	body := map[string]interface{}{
		"archived": true,
		"locked":   false, // locked threads can't be unarchived by activity
	}
	respBody, status, err := discordRequest(ctx, http.MethodPatch,
		"/channels/"+threadID, body)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
		return nil
	}
	if status >= 400 {
		return fmt.Errorf("discord archive thread: status %d body %s", status, string(respBody))
	}
	return nil
}

// =============================================================================
// Slash command registration
// =============================================================================

// discordSlashCommand is the minimal payload for registering a guild
// command. Discord's API supports many more options (subcommands,
// autocomplete, etc.) — we only need the basics.
type discordSlashCommand struct {
	Name        string                      `json:"name"`
	Description string                      `json:"description"`
	Type        int                         `json:"type"` // 1 = CHAT_INPUT
	Options     []discordSlashCommandOption `json:"options,omitempty"`
}

type discordSlashCommandOption struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        int    `json:"type"` // 3 = STRING
	Required    bool   `json:"required,omitempty"`
}

// registerDiscordSlashCommands upserts our guild-scoped slash commands.
// Discord's bulk-overwrite endpoint replaces the entire command set in
// one call, which is what we want — runs idempotently on every startup.
//
// Guild-scoped commands appear instantly; global commands have a 1-hour
// propagation delay. We use guild-scoped because we have one server.
func registerDiscordSlashCommands(ctx context.Context) error {
	cfg, ok := loadDiscordConfig()
	if !ok {
		return errors.New("discord not configured")
	}

	commands := []discordSlashCommand{
		{
			Name:        "inbox",
			Description: "Show pending support drafts (most recent 5)",
			Type:        1,
		},
		{
			Name:        "ticket",
			Description: "Show the latest draft for a ticket number",
			Type:        1,
			Options: []discordSlashCommandOption{
				{
					Name:        "number",
					Description: "osTicket ticket number (e.g. 239171)",
					Type:        3,
					Required:    true,
				},
			},
		},
	}

	path := fmt.Sprintf("/applications/%s/guilds/%s/commands",
		cfg.ApplicationID, cfg.GuildID)
	respBody, status, err := discordRequest(ctx, http.MethodPut, path, commands)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("register slash commands: status %d body %s", status, string(respBody))
	}
	return nil
}

// RegisterDiscordSlashCommandsAtBoot is the public boot hook called
// from main.go. No-op when Discord isn't configured. Errors are logged
// but never fatal — the API stays up either way.
func RegisterDiscordSlashCommandsAtBoot(ctx context.Context) {
	if _, ok := loadDiscordConfig(); !ok {
		log.Println("[Discord] not configured; skipping slash command registration")
		return
	}
	if err := registerDiscordSlashCommands(ctx); err != nil {
		log.Printf("[Discord] register slash commands: %v", err)
		return
	}
	log.Println("[Discord] slash commands registered (/inbox, /ticket)")
}

// =============================================================================
// Inbound signature verification
// =============================================================================

// verifyDiscordSignature checks that a request from Discord is genuine.
// Discord signs every interaction with Ed25519: the signing payload is
// timestamp + body, signed with the application's signing key.
//
// Returns nil if the signature is valid; an error otherwise. Callers
// should respond 401 to the HTTP request when this returns non-nil.
//
// The verification IS time-sensitive in that Discord includes a
// timestamp, but we don't reject old requests by clock — Discord
// retries with the same timestamp. The crypto verification is
// sufficient.
func verifyDiscordSignature(publicKeyHex, signatureHex, timestamp string, body []byte) error {
	pubKey, err := hex.DecodeString(publicKeyHex)
	if err != nil {
		return fmt.Errorf("decode public key: %w", err)
	}
	if len(pubKey) != ed25519.PublicKeySize {
		return fmt.Errorf("public key wrong size: got %d want %d", len(pubKey), ed25519.PublicKeySize)
	}

	signature, err := hex.DecodeString(signatureHex)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}
	if len(signature) != ed25519.SignatureSize {
		return fmt.Errorf("signature wrong size: got %d want %d", len(signature), ed25519.SignatureSize)
	}

	// The signed payload is timestamp + body, no separator.
	signed := make([]byte, 0, len(timestamp)+len(body))
	signed = append(signed, []byte(timestamp)...)
	signed = append(signed, body...)

	if !ed25519.Verify(pubKey, signed, signature) {
		return errors.New("signature verification failed")
	}
	return nil
}

// =============================================================================
// Thread persistence
// =============================================================================

// SupportTicketThread mirrors the support_ticket_threads table.
type SupportTicketThread struct {
	TicketNumber    string
	DiscordThreadID string
	ChannelID       string
	Archived        bool
	CreatedAt       time.Time
}

// upsertSupportTicketThread inserts or updates the ticket→thread
// mapping. Idempotent on ticket_number (unique key).
func upsertSupportTicketThread(ctx context.Context, t *SupportTicketThread) error {
	const q = `
		INSERT INTO support_ticket_threads
			(ticket_number, discord_thread_id, channel_id, archived)
		VALUES ($1, $2, $3, FALSE)
		ON CONFLICT (ticket_number) DO UPDATE
			SET discord_thread_id = EXCLUDED.discord_thread_id,
				channel_id = EXCLUDED.channel_id,
				archived = FALSE
	`
	_, err := DBPool.Exec(ctx, q, t.TicketNumber, t.DiscordThreadID, t.ChannelID)
	if err != nil {
		return fmt.Errorf("upsert ticket thread: %w", err)
	}
	return nil
}

// loadSupportTicketThread looks up the Discord thread ID for a ticket.
// Returns (nil, nil) when no mapping exists.
func loadSupportTicketThread(ctx context.Context, ticketNumber string) (*SupportTicketThread, error) {
	const q = `
		SELECT ticket_number, discord_thread_id, channel_id, archived, created_at
		FROM support_ticket_threads
		WHERE ticket_number = $1
	`
	var t SupportTicketThread
	err := DBPool.QueryRow(ctx, q, ticketNumber).Scan(
		&t.TicketNumber, &t.DiscordThreadID, &t.ChannelID, &t.Archived, &t.CreatedAt,
	)
	if err != nil {
		// Return nil, nil for "not found" so callers can branch easily.
		// Specifically: pgx returns ErrNoRows on no rows, which we
		// translate here.
		if strings.Contains(err.Error(), "no rows") {
			return nil, nil
		}
		return nil, fmt.Errorf("load ticket thread: %w", err)
	}
	return &t, nil
}

// markSupportTicketThreadArchived flips the archived flag for a ticket's
// thread. Used after auto-close so we don't try to repost in archived
// threads on subsequent user replies (we'll create a new thread instead).
func markSupportTicketThreadArchived(ctx context.Context, ticketNumber string) error {
	const q = `UPDATE support_ticket_threads SET archived = TRUE WHERE ticket_number = $1`
	_, err := DBPool.Exec(ctx, q, ticketNumber)
	return err
}

// =============================================================================
// Notification entry point — called from notifyPartnerAfterDraft
// =============================================================================

// notifyDiscordForDraft posts a new ticket draft to Discord. Creates a
// thread if one doesn't exist for this ticket, posts a follow-up
// message if it does. Either way, the message includes the user's body,
// the AI summary + drafted reply, and three action buttons.
//
// Fail-open: any error here is logged and swallowed. The email path
// (if enabled) covers us.
func notifyDiscordForDraft(ctx context.Context, draft *SupportDraft) {
	if !shouldNotifyDiscord() {
		return
	}
	cfg, _ := loadDiscordConfig() // ok already verified by shouldNotifyDiscord

	threadID, err := getOrCreateThreadForTicket(ctx, cfg, draft)
	if err != nil {
		log.Printf("[Discord] getOrCreateThread for ticket %s: %v", draft.TicketNumber, err)
		return
	}

	content := buildDraftMessageContent(draft)
	components := buildDraftActionButtons(draft.ID)

	if _, err := discordPostMessage(ctx, threadID, content, components); err != nil {
		log.Printf("[Discord] post draft message for ticket %s: %v", draft.TicketNumber, err)
		return
	}
}

// getOrCreateThreadForTicket looks up an existing thread or creates a
// new one. Threads that have been archived (via the close path) are
// treated as not-existing and a new thread is created.
func getOrCreateThreadForTicket(ctx context.Context, cfg DiscordConfig, draft *SupportDraft) (string, error) {
	existing, err := loadSupportTicketThread(ctx, draft.TicketNumber)
	if err != nil {
		return "", fmt.Errorf("load existing thread: %w", err)
	}
	if existing != nil && !existing.Archived {
		return existing.DiscordThreadID, nil
	}

	// Create a new thread.
	subject := draft.OriginalSubject
	if subject == "" {
		subject = "support ticket"
	}
	// Truncate so the formatted name fits Discord's 100-char limit.
	if len(subject) > 70 {
		subject = subject[:70] + "..."
	}
	name := fmt.Sprintf("[#%s] %s", draft.TicketNumber, subject)

	thread, err := discordCreateThread(ctx, cfg.SupportChannelID, name)
	if err != nil {
		return "", fmt.Errorf("create thread: %w", err)
	}

	// Persist the mapping.
	if err := upsertSupportTicketThread(ctx, &SupportTicketThread{
		TicketNumber:    draft.TicketNumber,
		DiscordThreadID: thread.ID,
		ChannelID:       cfg.SupportChannelID,
	}); err != nil {
		// Non-fatal — thread is created in Discord, we just couldn't
		// persist the mapping. Next user reply will create yet another
		// thread, which is bad UX but not a hard failure. Log and
		// continue so the partner still gets the message in the new
		// thread.
		log.Printf("[Discord] persist thread mapping for ticket %s: %v", draft.TicketNumber, err)
	}

	return thread.ID, nil
}

// buildDraftMessageContent renders the user message + AI metadata +
// drafted reply into Discord's text content. Discord supports basic
// markdown (bold, blockquote, code) and a 2000-char limit per message.
//
// We trim aggressively so the content fits even with verbose user
// bodies.
func buildDraftMessageContent(draft *SupportDraft) string {
	var b strings.Builder

	header := fmt.Sprintf("**Ticket #%s** — `%s` · `%s` · confidence: `%s`",
		draft.TicketNumber, draft.AICategory, draft.AIPriority, draft.AIConfidence)
	b.WriteString(header)
	b.WriteString("\n\n")

	if draft.UserMessageHTML != "" {
		b.WriteString("**What the user wrote:**\n")
		b.WriteString(blockquoteText(htmlToPlain(draft.UserMessageHTML), 600))
		b.WriteString("\n\n")
	}

	b.WriteString("**AI summary:** ")
	b.WriteString(draft.AISummary)
	b.WriteString("\n\n")

	b.WriteString("**Drafted reply:**\n")
	b.WriteString(blockquoteText(htmlToPlain(draft.DraftBodyHTML), 800))

	// Reserve some headroom for Discord's hard 2000-char limit.
	out := b.String()
	if len(out) > 1900 {
		out = out[:1900] + "\n\n_...truncated_"
	}
	return out
}

// buildDraftActionButtons returns the action-row components for a
// pending draft.
func buildDraftActionButtons(draftID int64) []DiscordActionRow {
	send := DiscordMessageButton{
		Type:     2,
		Style:    3, // success / green
		Label:    "Send",
		CustomID: fmt.Sprintf("support_send:%d", draftID),
	}
	send.Emoji = &struct {
		Name string `json:"name"`
	}{Name: "✅"}
	edit := DiscordMessageButton{
		Type:     2,
		Style:    1, // primary / blue
		Label:    "Edit",
		CustomID: fmt.Sprintf("support_edit:%d", draftID),
	}
	edit.Emoji = &struct {
		Name string `json:"name"`
	}{Name: "✏️"}
	skip := DiscordMessageButton{
		Type:     2,
		Style:    2, // secondary / gray
		Label:    "Skip",
		CustomID: fmt.Sprintf("support_skip:%d", draftID),
	}
	skip.Emoji = &struct {
		Name string `json:"name"`
	}{Name: "⏭️"}

	return []DiscordActionRow{
		{
			Type:       1,
			Components: []DiscordMessageButton{send, edit, skip},
		},
	}
}

// =============================================================================
// Plain-text helpers (Discord's text/markdown is much simpler than HTML)
// =============================================================================

// htmlToPlain strips HTML tags and decodes a few common entities so the
// content reads cleanly in Discord's markdown. Not a full HTML parser —
// the AI drafts and user messages are simple enough that a regex-style
// strip is sufficient.
func htmlToPlain(s string) string {
	out := s

	// Replace common block-ish tags with newlines so paragraphs stay
	// readable in Discord.
	replacements := []struct{ from, to string }{
		{"<br/>", "\n"},
		{"<br />", "\n"},
		{"<br>", "\n"},
		{"</p>", "\n\n"},
		{"</div>", "\n"},
		{"</li>", "\n"},
		{"<li>", "• "},
	}
	for _, r := range replacements {
		out = strings.ReplaceAll(out, r.from, r.to)
		out = strings.ReplaceAll(out, strings.ToUpper(r.from), r.to)
	}

	// Strip remaining tags.
	out = stripHTMLTags(out)

	// Decode a few common entities.
	entities := map[string]string{
		"&nbsp;": " ",
		"&amp;":  "&",
		"&lt;":   "<",
		"&gt;":   ">",
		"&quot;": "\"",
		"&#39;":  "'",
	}
	for from, to := range entities {
		out = strings.ReplaceAll(out, from, to)
	}

	// Collapse 3+ newlines.
	for strings.Contains(out, "\n\n\n") {
		out = strings.ReplaceAll(out, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(out)
}

// stripHTMLTags removes everything between < and >. Naive but
// sufficient for our trusted-input content.
func stripHTMLTags(s string) string {
	var out strings.Builder
	out.Grow(len(s))
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			out.WriteRune(r)
		}
	}
	return out.String()
}

// blockquoteText prefixes each line with `> ` so Discord renders it as
// a quote block. Truncates to maxBytes (rough char count).
func blockquoteText(s string, maxBytes int) string {
	if len(s) > maxBytes {
		s = s[:maxBytes] + "..."
	}
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = "> " + line
	}
	return strings.Join(lines, "\n")
}
