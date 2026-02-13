package core

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stripe/stripe-go/v82"
	checkoutsession "github.com/stripe/stripe-go/v82/checkout/session"
	stripecustomer "github.com/stripe/stripe-go/v82/customer"
	stripesubscription "github.com/stripe/stripe-go/v82/subscription"
)

// =============================================================================
// Stripe Billing Handlers
// =============================================================================

// initStripe sets the Stripe API key. Called during server setup.
func initStripe() {
	key := os.Getenv("STRIPE_SECRET_KEY")
	if key == "" {
		log.Println("[Billing] Warning: STRIPE_SECRET_KEY not set — billing endpoints will fail")
		return
	}
	stripe.Key = key
	log.Println("[Billing] Stripe API initialized")
}

// planFromPriceID maps a Stripe price ID to a human-readable plan name.
func planFromPriceID(priceID string) string {
	monthly := os.Getenv("STRIPE_PRICE_MONTHLY")
	quarterly := os.Getenv("STRIPE_PRICE_QUARTERLY")
	annual := os.Getenv("STRIPE_PRICE_ANNUAL")
	lifetime := os.Getenv("STRIPE_PRICE_LIFETIME")

	switch priceID {
	case monthly:
		return "monthly"
	case quarterly:
		return "quarterly"
	case annual:
		return "annual"
	case lifetime:
		return "lifetime"
	default:
		return "unknown"
	}
}

// getOrCreateStripeCustomer looks up or creates a Stripe customer for the user.
func getOrCreateStripeCustomer(logtoSub, email string) (string, error) {
	// Check DB first
	var customerID string
	err := DBPool.QueryRow(context.Background(),
		`SELECT stripe_customer_id FROM stripe_customers WHERE logto_sub = $1`, logtoSub,
	).Scan(&customerID)
	if err == nil && customerID != "" {
		return customerID, nil
	}

	// Create Stripe customer
	params := &stripe.CustomerParams{
		Email: stripe.String(email),
	}
	params.AddMetadata("logto_sub", logtoSub)
	c, err := stripecustomer.New(params)
	if err != nil {
		return "", err
	}

	// Insert into DB
	_, err = DBPool.Exec(context.Background(),
		`INSERT INTO stripe_customers (logto_sub, stripe_customer_id)
		 VALUES ($1, $2)
		 ON CONFLICT (logto_sub) DO UPDATE SET stripe_customer_id = $2, updated_at = now()`,
		logtoSub, c.ID,
	)
	if err != nil {
		log.Printf("[Billing] DB insert for customer %s failed: %v", logtoSub, err)
	}

	return c.ID, nil
}

// HandleCreateCheckoutSession creates a Stripe Checkout Session (custom UI mode)
// for recurring subscriptions (monthly, quarterly, annual).
func HandleCreateCheckoutSession(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized", Error: "Authentication required",
		})
	}

	var req CheckoutRequest
	if err := c.BodyParser(&req); err != nil || req.PriceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error", Error: "price_id is required",
		})
	}

	// Validate the price is one of our known recurring prices
	plan := planFromPriceID(req.PriceID)
	if plan == "unknown" || plan == "lifetime" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error", Error: "Invalid price_id for subscription checkout",
		})
	}

	// Check if user already has an active subscription
	var existingPlan string
	var existingStatus string
	err := DBPool.QueryRow(context.Background(),
		`SELECT plan, status FROM stripe_customers WHERE logto_sub = $1`, userID,
	).Scan(&existingPlan, &existingStatus)
	if err == nil && existingPlan != "free" && existingStatus == "active" {
		return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
			Status: "error", Error: "You already have an active subscription",
		})
	}

	// Get email from JWT claims (may be empty)
	email, _ := c.Locals("user_email").(string)

	customerID, err := getOrCreateStripeCustomer(userID, email)
	if err != nil {
		log.Printf("[Billing] Failed to create Stripe customer for %s: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Failed to initialize billing",
		})
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = DefaultFrontendURL
	}

	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		UIMode:   stripe.String(string(stripe.CheckoutSessionUIModeCustom)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(req.PriceID),
				Quantity: stripe.Int64(1),
			},
		},
		ReturnURL: stripe.String(frontendURL + "/uplink?session_id={CHECKOUT_SESSION_ID}"),
	}
	params.AddMetadata("logto_sub", userID)
	params.AddMetadata("plan", plan)

	session, err := checkoutsession.New(params)
	if err != nil {
		log.Printf("[Billing] Failed to create checkout session for %s: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Failed to create checkout session",
		})
	}

	return c.JSON(CheckoutResponse{
		ClientSecret:   session.ClientSecret,
		SessionID:      session.ID,
		PublishableKey: os.Getenv("STRIPE_PUBLISHABLE_KEY"),
	})
}

// HandleCreateLifetimeCheckout creates a one-time payment Checkout Session for lifetime.
func HandleCreateLifetimeCheckout(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized", Error: "Authentication required",
		})
	}

	lifetimePrice := os.Getenv("STRIPE_PRICE_LIFETIME")
	if lifetimePrice == "" {
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Lifetime pricing not configured",
		})
	}

	// Check if user already has active subscription or lifetime
	var existingPlan string
	var existingStatus string
	var isLifetime bool
	err := DBPool.QueryRow(context.Background(),
		`SELECT plan, status, lifetime FROM stripe_customers WHERE logto_sub = $1`, userID,
	).Scan(&existingPlan, &existingStatus, &isLifetime)
	if err == nil {
		if isLifetime {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Status: "error", Error: "You already have a lifetime membership",
			})
		}
		if existingPlan != "free" && existingStatus == "active" {
			return c.Status(fiber.StatusConflict).JSON(ErrorResponse{
				Status: "error", Error: "Please cancel your current subscription before purchasing lifetime",
			})
		}
	}

	email, _ := c.Locals("user_email").(string)
	customerID, err := getOrCreateStripeCustomer(userID, email)
	if err != nil {
		log.Printf("[Billing] Failed to create Stripe customer for %s: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Failed to initialize billing",
		})
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = DefaultFrontendURL
	}

	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModePayment)),
		UIMode:   stripe.String(string(stripe.CheckoutSessionUIModeCustom)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(lifetimePrice),
				Quantity: stripe.Int64(1),
			},
		},
		ReturnURL: stripe.String(frontendURL + "/uplink/lifetime?session_id={CHECKOUT_SESSION_ID}"),
	}
	params.AddMetadata("logto_sub", userID)
	params.AddMetadata("plan", "lifetime")

	session, err := checkoutsession.New(params)
	if err != nil {
		log.Printf("[Billing] Failed to create lifetime checkout for %s: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Failed to create checkout session",
		})
	}

	return c.JSON(CheckoutResponse{
		ClientSecret:   session.ClientSecret,
		SessionID:      session.ID,
		PublishableKey: os.Getenv("STRIPE_PUBLISHABLE_KEY"),
	})
}

// HandleCheckoutReturn returns the status of a checkout session.
// Frontend calls this after redirect to confirm the outcome.
func HandleCheckoutReturn(c *fiber.Ctx) error {
	sessionID := c.Query("session_id")
	if sessionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error", Error: "session_id is required",
		})
	}

	session, err := checkoutsession.Get(sessionID, nil)
	if err != nil {
		log.Printf("[Billing] Failed to retrieve session %s: %v", sessionID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Failed to retrieve checkout session",
		})
	}

	return c.JSON(CheckoutReturnResponse{
		Status:    string(session.Status),
		SessionID: session.ID,
	})
}

// HandleGetSubscription returns the current user's subscription status.
func HandleGetSubscription(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized", Error: "Authentication required",
		})
	}

	var sc StripeCustomer
	err := DBPool.QueryRow(context.Background(),
		`SELECT logto_sub, stripe_customer_id, stripe_subscription_id, plan, status,
		        current_period_end, lifetime, created_at, updated_at
		 FROM stripe_customers WHERE logto_sub = $1`, userID,
	).Scan(&sc.LogtoSub, &sc.StripeCustomerID, &sc.StripeSubscriptionID,
		&sc.Plan, &sc.Status, &sc.CurrentPeriodEnd, &sc.Lifetime,
		&sc.CreatedAt, &sc.UpdatedAt)

	if err != nil {
		// No billing record — user is on free plan
		return c.JSON(SubscriptionResponse{
			Plan:   "free",
			Status: "none",
		})
	}

	return c.JSON(SubscriptionResponse{
		Plan:             sc.Plan,
		Status:           sc.Status,
		CurrentPeriodEnd: sc.CurrentPeriodEnd,
		Lifetime:         sc.Lifetime,
	})
}

// HandleCancelSubscription cancels the user's Stripe subscription at period end.
func HandleCancelSubscription(c *fiber.Ctx) error {
	userID := GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized", Error: "Authentication required",
		})
	}

	var subID *string
	var isLifetime bool
	err := DBPool.QueryRow(context.Background(),
		`SELECT stripe_subscription_id, lifetime FROM stripe_customers WHERE logto_sub = $1`, userID,
	).Scan(&subID, &isLifetime)
	if err != nil || subID == nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error", Error: "No active subscription found",
		})
	}

	if isLifetime {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error", Error: "Lifetime memberships cannot be cancelled",
		})
	}

	// Cancel at period end (user keeps access until then)
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	sub, err := stripesubscription.Update(*subID, params)
	if err != nil {
		log.Printf("[Billing] Failed to cancel subscription %s for %s: %v", *subID, userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error", Error: "Failed to cancel subscription",
		})
	}

	// Update local DB — in stripe-go v82, CurrentPeriodEnd moved to SubscriptionItem
	var periodEndUnix int64
	if sub.Items != nil && len(sub.Items.Data) > 0 {
		periodEndUnix = sub.Items.Data[0].CurrentPeriodEnd
	}
	periodEnd := time.Unix(periodEndUnix, 0)
	_, _ = DBPool.Exec(context.Background(),
		`UPDATE stripe_customers SET status = 'canceling', current_period_end = $2, updated_at = now()
		 WHERE logto_sub = $1`,
		userID, periodEnd,
	)

	return c.JSON(fiber.Map{
		"status":             "canceling",
		"current_period_end": periodEnd,
		"message":            "Your subscription will end at the current billing period",
	})
}
