package core

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// =============================================================================
// Support drafts — DB-backed state for the L2 (partner-approval) flow
// =============================================================================
//
// Each incoming support ticket spawns a `support_drafts` row holding the
// AI-generated draft reply plus its triage metadata. The partner's
// approval URL handlers (handlers_support_approval.go) load this row,
// transition its status, and — on Send — kick off the outbound email
// via Resend (sendApprovedReply, defined below in Phase 1D).

// SupportDraft mirrors the support_drafts table.
type SupportDraft struct {
	ID              int64
	TicketNumber    string
	UserEmail       string
	UserName        string
	OriginalSubject string
	DraftBodyHTML   string
	AISummary       string
	AICategory      string
	AIPriority      string
	AIChannel       string
	AIDuplicateOf   string
	AIConfidence    string
	Status          string
	EditedBodyHTML  string
	DecidedAt       *time.Time
	SentAt          *time.Time
	CreatedAt       time.Time
}

// ErrAlreadyDecided indicates a draft was already actioned (single-use enforcement).
var ErrAlreadyDecided = errors.New("draft already decided")

// createSupportDraft persists a new pending draft. The caller hands us
// a fully-populated SupportDraft (other than ID/CreatedAt/Status) and
// receives the row back with those fields filled in. Status is always
// 'pending' on create; the partner-approval handlers transition it.
func createSupportDraft(ctx context.Context, draft *SupportDraft) (*SupportDraft, error) {
	if DBPool == nil {
		return nil, fmt.Errorf("DB not initialized")
	}

	const q = `
		INSERT INTO support_drafts
			(ticket_number, user_email, user_name, original_subject,
			 draft_body_html, ai_summary, ai_category, ai_priority,
			 ai_channel, ai_duplicate_of, ai_confidence, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
		RETURNING id, created_at
	`
	err := DBPool.QueryRow(ctx, q,
		draft.TicketNumber,
		draft.UserEmail,
		draft.UserName,
		draft.OriginalSubject,
		draft.DraftBodyHTML,
		draft.AISummary,
		draft.AICategory,
		draft.AIPriority,
		draft.AIChannel,
		draft.AIDuplicateOf,
		draft.AIConfidence,
	).Scan(&draft.ID, &draft.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("createSupportDraft: %w", err)
	}
	draft.Status = "pending"
	return draft, nil
}
