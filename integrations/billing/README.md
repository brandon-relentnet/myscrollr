# Billing — Stripe Connect Payment Handling

## Purpose

Handles all marketplace payment flows: developer onboarding to Stripe Connect, user purchases (one-time and subscription), platform fee collection, and payout management. Wraps Stripe Connect APIs into the marketplace billing model.

## Why It Exists

The marketplace supports three pricing models (free, one-time purchase, subscription) with a revenue split between developers and MyScrollr. Stripe Connect is purpose-built for this: it manages connected accounts, handles compliance/tax reporting, and routes payments with automatic fee splitting. This component encapsulates all Stripe interaction so the lifecycle and API layers don't deal with payment details directly.

See [MARKETPLACE.md — Monetization](../MARKETPLACE.md#monetization) for pricing models and revenue split, and [Billing Flow](../MARKETPLACE.md#billing-flow) for the step-by-step sequence.

## How It Fits

```
                   ┌──────────────┐
User clicks        │   Lifecycle  │
"Install" (paid)──►│   Service    │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐        ┌─────────────┐
                   │   Billing    │◄──────►│   Stripe    │
                   │  (this svc)  │        │   Connect   │
                   └──────┬───────┘        └─────────────┘
                          │
                   ┌──────▼───────┐
                   │  PostgreSQL  │  (payment records, subscription state)
                   └──────────────┘
```

- **Upstream**: Lifecycle service (triggers payment during install flow), developer portal (onboarding)
- **Downstream**: Stripe Connect API, PostgreSQL (payment records)
- **Frontend**: `@stripe/react-stripe-js` in `myscrollr.com/` for checkout UI
- **Relates to**: `lifecycle/` (install flow orchestration), `portal/` (developer Stripe onboarding), `api/` (billing API endpoints)

## What Goes Here

```
billing/
├── README.md               # This file
├── src/
│   ├── checkout.go         # Stripe Checkout session creation
│   ├── connect.go          # Developer connected account onboarding
│   ├── webhooks.go         # Stripe webhook handlers (payment success, failure, subscription events)
│   ├── subscriptions.go    # Subscription lifecycle management
│   └── payouts.go          # Payout tracking and reporting
├── migrations/             # Payment-related tables
└── tests/
```

**Libraries**: `stripe-go` SDK in Go, `@stripe/react-stripe-js` on the frontend.

## Key Decisions / Open Questions

- **Stripe Connect account type**: Standard (developer manages their own Stripe dashboard), Express (simplified onboarding, MyScrollr-branded), or Custom (full control, most work). See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **Platform fee percentage**: 15-20% mentioned in MARKETPLACE.md — needs a final decision.
- **Refund handling**: What happens when an install is rolled back after payment? Automatic refund policy?
- **Subscription billing anchor**: Monthly from install date, or aligned to calendar month?
