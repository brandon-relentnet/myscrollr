package core

import (
	"time"
)

// UserPreferences represents a user's extension display preferences.
type UserPreferences struct {
	LogtoSub         string   `json:"-"`
	FeedMode         string   `json:"feed_mode"`
	FeedPosition     string   `json:"feed_position"`
	FeedBehavior     string   `json:"feed_behavior"`
	FeedEnabled      bool     `json:"feed_enabled"`
	EnabledSites     []string `json:"enabled_sites"`
	DisabledSites    []string `json:"disabled_sites"`
	SubscriptionTier string   `json:"subscription_tier"`
	UpdatedAt        string   `json:"updated_at"`
}

// Channel represents a user's subscription to a data channel.
type Channel struct {
	ID          int                    `json:"id"`
	LogtoSub    string                 `json:"-"`
	ChannelType string                 `json:"channel_type"`
	Enabled     bool                   `json:"enabled"`
	Visible     bool                   `json:"visible"`
	Config      map[string]interface{} `json:"config"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// DashboardResponse is the aggregated response for the /dashboard endpoint.
// Data is a generic map keyed by channel name (e.g. "finance", "sports").
type DashboardResponse struct {
	Data        map[string]interface{} `json:"data"`
	Preferences *UserPreferences       `json:"preferences,omitempty"`
	Channels    []Channel              `json:"channels,omitempty"`
}

// HealthResponse represents the aggregated health status.
type HealthResponse struct {
	Status   string            `json:"status"`
	Database string            `json:"database"`
	Redis    string            `json:"redis"`
	Services map[string]string `json:"services"`
}

// ErrorResponse represents a standard API error.
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// =============================================================================
// Billing
// =============================================================================

// StripeCustomer maps a Logto user to their Stripe customer and subscription.
type StripeCustomer struct {
	LogtoSub             string     `json:"logto_sub"`
	StripeCustomerID     string     `json:"stripe_customer_id"`
	StripeSubscriptionID *string    `json:"stripe_subscription_id,omitempty"`
	Plan                 string     `json:"plan"`
	Status               string     `json:"status"`
	CurrentPeriodEnd     *time.Time `json:"current_period_end,omitempty"`
	Lifetime             bool       `json:"lifetime"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// CheckoutRequest is the body for POST /checkout/session.
type CheckoutRequest struct {
	PriceID string `json:"price_id"`
}

// PlanChangeRequest is the body for PUT /users/me/subscription/plan.
type PlanChangeRequest struct {
	PriceID       string `json:"price_id"`
	ProrationDate int64  `json:"proration_date,omitempty"`
}

// PlanPreviewResponse returns the proration preview for a plan change.
type PlanPreviewResponse struct {
	AmountDue     int64  `json:"amount_due"`
	Currency      string `json:"currency"`
	ProrationDate int64  `json:"proration_date"`
	IsDowngrade   bool   `json:"is_downgrade"`
	ScheduledDate int64  `json:"scheduled_date,omitempty"`
	IsTrialChange bool   `json:"is_trial_change,omitempty"`
	TrialEnd      int64  `json:"trial_end,omitempty"`
}

// CheckoutResponse returns the client secret for the Payment Element.
type CheckoutResponse struct {
	ClientSecret    string `json:"client_secret"`
	SessionID       string `json:"session_id"`
	PublishableKey  string `json:"publishable_key"`
}

// SubscriptionResponse returns the user's subscription state.
type SubscriptionResponse struct {
	Plan                 string     `json:"plan"`
	Status               string     `json:"status"`
	CurrentPeriodEnd     *time.Time `json:"current_period_end,omitempty"`
	Lifetime             bool       `json:"lifetime"`
	PendingDowngradePlan string     `json:"pending_downgrade_plan,omitempty"`
	ScheduledChangeAt    *time.Time `json:"scheduled_change_at,omitempty"`
	Amount               int64      `json:"amount,omitempty"`
	Currency             string     `json:"currency,omitempty"`
	Interval             string     `json:"interval,omitempty"`
	TrialEnd             *int64     `json:"trial_end,omitempty"`
}

// CheckoutReturnResponse tells the frontend about the checkout outcome.
type CheckoutReturnResponse struct {
	Status    string `json:"status"`
	SessionID string `json:"session_id,omitempty"`
}
