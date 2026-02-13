package core

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/webhook"
)

// =============================================================================
// Stripe Webhook Handler
// =============================================================================

// HandleStripeWebhook receives Stripe webhook events, verifies signatures,
// and dispatches to the appropriate handler.
func HandleStripeWebhook(c *fiber.Ctx) error {
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	if webhookSecret == "" {
		log.Println("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set")
		return c.SendStatus(fiber.StatusInternalServerError)
	}

	payload := c.Body()
	sigHeader := c.Get("Stripe-Signature")

	event, err := webhook.ConstructEventWithOptions(payload, sigHeader, webhookSecret,
		webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true})
	if err != nil {
		log.Printf("[Stripe Webhook] Signature verification failed: %v", err)
		return c.SendStatus(fiber.StatusBadRequest)
	}

	switch event.Type {
	case "checkout.session.completed":
		handleCheckoutCompleted(event)
	case "customer.subscription.updated":
		handleSubscriptionUpdated(event)
	case "customer.subscription.deleted":
		handleSubscriptionDeleted(event)
	case "invoice.paid":
		handleInvoicePaid(event)
	case "invoice.payment_failed":
		handleInvoicePaymentFailed(event)
	default:
		log.Printf("[Stripe Webhook] Unhandled event type: %s", event.Type)
	}

	return c.SendStatus(fiber.StatusOK)
}

// handleCheckoutCompleted processes successful checkout sessions.
// This is the primary entry point for new subscriptions and lifetime purchases.
func handleCheckoutCompleted(event stripe.Event) {
	var session stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
		log.Printf("[Stripe Webhook] Failed to parse checkout.session.completed: %v", err)
		return
	}

	logtoSub := session.Metadata["logto_sub"]
	plan := session.Metadata["plan"]
	if logtoSub == "" || plan == "" {
		log.Printf("[Stripe Webhook] checkout.session.completed missing metadata (logto_sub=%s, plan=%s)", logtoSub, plan)
		return
	}

	customerID := ""
	if session.Customer != nil {
		customerID = session.Customer.ID
	}

	log.Printf("[Stripe Webhook] Checkout completed: user=%s plan=%s mode=%s", logtoSub, plan, session.Mode)

	if plan == "lifetime" {
		// One-time payment — mark as lifetime
		_, err := DBPool.Exec(context.Background(),
			`INSERT INTO stripe_customers (logto_sub, stripe_customer_id, plan, status, lifetime)
			 VALUES ($1, $2, $3, 'active', true)
			 ON CONFLICT (logto_sub) DO UPDATE SET
			   stripe_customer_id = $2, plan = $3, status = 'active',
			   lifetime = true, updated_at = now()`,
			logtoSub, customerID, plan,
		)
		if err != nil {
			log.Printf("[Stripe Webhook] Failed to upsert lifetime for %s: %v", logtoSub, err)
			return
		}
	} else {
		// Subscription — store subscription ID
		subID := ""
		if session.Subscription != nil {
			subID = session.Subscription.ID
		}

		_, err := DBPool.Exec(context.Background(),
			`INSERT INTO stripe_customers (logto_sub, stripe_customer_id, stripe_subscription_id, plan, status)
			 VALUES ($1, $2, $3, $4, 'active')
			 ON CONFLICT (logto_sub) DO UPDATE SET
			   stripe_customer_id = $2, stripe_subscription_id = $3,
			   plan = $4, status = 'active', updated_at = now()`,
			logtoSub, customerID, subID, plan,
		)
		if err != nil {
			log.Printf("[Stripe Webhook] Failed to upsert subscription for %s: %v", logtoSub, err)
			return
		}
	}

	// Assign the uplink role in Logto (async — don't block webhook response)
	go func() {
		if err := AssignUplinkRole(logtoSub); err != nil {
			log.Printf("[Stripe Webhook] Failed to assign uplink role to %s: %v", logtoSub, err)
		}
	}()
}

// handleSubscriptionUpdated handles subscription changes (renewals, plan changes, cancellations).
func handleSubscriptionUpdated(event stripe.Event) {
	var sub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
		log.Printf("[Stripe Webhook] Failed to parse subscription.updated: %v", err)
		return
	}

	// Look up user by Stripe customer ID
	logtoSub := lookupLogtoSub(sub.Customer.ID)
	if logtoSub == "" {
		log.Printf("[Stripe Webhook] No user found for customer %s", sub.Customer.ID)
		return
	}

	status := string(sub.Status)
	// In stripe-go v82, CurrentPeriodEnd moved to SubscriptionItem
	var periodEndUnix int64
	if sub.Items != nil && len(sub.Items.Data) > 0 {
		periodEndUnix = sub.Items.Data[0].CurrentPeriodEnd
	}
	periodEnd := time.Unix(periodEndUnix, 0)

	// Determine plan from the first line item
	plan := "unknown"
	if sub.Items != nil && len(sub.Items.Data) > 0 {
		plan = planFromPriceID(sub.Items.Data[0].Price.ID)
	}

	log.Printf("[Stripe Webhook] Subscription updated: user=%s status=%s plan=%s cancel_at_period_end=%v",
		logtoSub, status, plan, sub.CancelAtPeriodEnd)

	dbStatus := status
	if sub.CancelAtPeriodEnd {
		dbStatus = "canceling"
	}

	_, err := DBPool.Exec(context.Background(),
		`UPDATE stripe_customers SET
		   plan = $2, status = $3, current_period_end = $4,
		   stripe_subscription_id = $5, updated_at = now()
		 WHERE logto_sub = $1`,
		logtoSub, plan, dbStatus, periodEnd, sub.ID,
	)
	if err != nil {
		log.Printf("[Stripe Webhook] Failed to update subscription for %s: %v", logtoSub, err)
	}

	// If subscription is active (not canceling), ensure role is assigned
	if status == "active" && !sub.CancelAtPeriodEnd {
		go func() {
			if err := AssignUplinkRole(logtoSub); err != nil {
				log.Printf("[Stripe Webhook] Failed to assign uplink role to %s: %v", logtoSub, err)
			}
		}()
	}
}

// handleSubscriptionDeleted fires when a subscription is fully cancelled (period ended).
func handleSubscriptionDeleted(event stripe.Event) {
	var sub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
		log.Printf("[Stripe Webhook] Failed to parse subscription.deleted: %v", err)
		return
	}

	logtoSub := lookupLogtoSub(sub.Customer.ID)
	if logtoSub == "" {
		log.Printf("[Stripe Webhook] No user found for customer %s", sub.Customer.ID)
		return
	}

	log.Printf("[Stripe Webhook] Subscription deleted: user=%s", logtoSub)

	// Check if user has lifetime (don't remove role if so)
	var isLifetime bool
	_ = DBPool.QueryRow(context.Background(),
		`SELECT lifetime FROM stripe_customers WHERE logto_sub = $1`, logtoSub,
	).Scan(&isLifetime)

	// Reset to free plan in DB
	_, err := DBPool.Exec(context.Background(),
		`UPDATE stripe_customers SET
		   plan = 'free', status = 'canceled', stripe_subscription_id = NULL,
		   current_period_end = NULL, updated_at = now()
		 WHERE logto_sub = $1 AND lifetime = false`,
		logtoSub,
	)
	if err != nil {
		log.Printf("[Stripe Webhook] Failed to reset subscription for %s: %v", logtoSub, err)
	}

	// Remove uplink role (only if not lifetime)
	if !isLifetime {
		go func() {
			if err := RemoveUplinkRole(logtoSub); err != nil {
				log.Printf("[Stripe Webhook] Failed to remove uplink role from %s: %v", logtoSub, err)
			}
		}()
	}
}

// handleInvoicePaid confirms successful payment for a subscription renewal.
func handleInvoicePaid(event stripe.Event) {
	var invoice struct {
		Customer     string `json:"customer"`
		Subscription string `json:"subscription"`
	}
	if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
		log.Printf("[Stripe Webhook] Failed to parse invoice.paid: %v", err)
		return
	}

	logtoSub := lookupLogtoSub(invoice.Customer)
	if logtoSub == "" {
		return
	}

	log.Printf("[Stripe Webhook] Invoice paid for user=%s", logtoSub)

	// Ensure role is still assigned on successful renewal
	go func() {
		if err := AssignUplinkRole(logtoSub); err != nil {
			log.Printf("[Stripe Webhook] Failed to re-assign uplink role to %s: %v", logtoSub, err)
		}
	}()
}

// handleInvoicePaymentFailed handles failed subscription payments.
func handleInvoicePaymentFailed(event stripe.Event) {
	var invoice struct {
		Customer     string `json:"customer"`
		Subscription string `json:"subscription"`
		AttemptCount int    `json:"attempt_count"`
	}
	if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
		log.Printf("[Stripe Webhook] Failed to parse invoice.payment_failed: %v", err)
		return
	}

	logtoSub := lookupLogtoSub(invoice.Customer)
	if logtoSub == "" {
		return
	}

	log.Printf("[Stripe Webhook] Payment failed for user=%s (attempt %d)", logtoSub, invoice.AttemptCount)

	// Mark as past_due in our DB
	_, _ = DBPool.Exec(context.Background(),
		`UPDATE stripe_customers SET status = 'past_due', updated_at = now()
		 WHERE logto_sub = $1 AND lifetime = false`,
		logtoSub,
	)
}

// lookupLogtoSub finds the Logto user ID for a Stripe customer ID.
func lookupLogtoSub(stripeCustomerID string) string {
	var logtoSub string
	err := DBPool.QueryRow(context.Background(),
		`SELECT logto_sub FROM stripe_customers WHERE stripe_customer_id = $1`, stripeCustomerID,
	).Scan(&logtoSub)
	if err != nil {
		return ""
	}
	return logtoSub
}
