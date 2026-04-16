import { useEffect, useRef, useState } from 'react'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import type { Appearance, StripeElementsOptions } from '@stripe/stripe-js'
import { AlertTriangle, Loader2, Lock, X } from 'lucide-react'
import { billingApi } from '@/api/client'
import type { PaymentIntentResponse, SetupIntentResponse } from '@/api/client'

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
)

// Stripe Elements appearance matching the site's dark theme
const appearance: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#6366f1',
    colorBackground: '#1a1a2e',
    colorText: '#e2e8f0',
    colorDanger: '#ef4444',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid rgba(255, 255, 255, 0.1)',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    '.Input:focus': {
      border: '1px solid #6366f1',
      boxShadow: '0 0 0 1px #6366f1',
    },
    '.Label': {
      color: '#94a3b8',
      fontSize: '12px',
    },
  },
}

// ── Types ──────────────────────────────────────────────────────────

interface SubscriptionPlan {
  name: string
  tier: 'uplink' | 'pro' | 'ultimate'
  priceId: string
  price: number
  interval: 'monthly' | 'annual'
  perMonth: number
}

interface LifetimePlan {
  name: 'Lifetime'
  tier: 'lifetime'
  price: 399
}

type PlanInfo = SubscriptionPlan | LifetimePlan

interface CheckoutModalProps {
  plan: PlanInfo
  hasTrial: boolean
  getToken: () => Promise<string | null>
  onSuccess: () => void
  onClose: () => void
}

type CheckoutState = 'idle' | 'loading' | 'ready' | 'submitting' | 'success'

// ── Tier colors ────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { badge: string; accent: string }> = {
  uplink: {
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    accent: 'text-blue-400',
  },
  pro: {
    badge: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    accent: 'text-purple-400',
  },
  ultimate: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    accent: 'text-amber-400',
  },
  lifetime: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    accent: 'text-emerald-400',
  },
}

// ── Helper ─────────────────────────────────────────────────────────

function isLifetimePlan(plan: PlanInfo): plan is LifetimePlan {
  return plan.tier === 'lifetime'
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function trialEndDate(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Inner Payment Form ─────────────────────────────────────────────

interface PaymentFormProps {
  plan: PlanInfo
  hasTrial: boolean
  setupIntent?: SetupIntentResponse
  getToken: () => Promise<string | null>
  onReady: () => void
  onSuccess: () => void
  onError: (msg: string) => void
}

function PaymentForm({
  plan,
  hasTrial,
  setupIntent: _setupIntent,
  getToken,
  onReady,
  onSuccess,
  onError,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLifetime = isLifetimePlan(plan)
  const buttonLabel = isLifetime
    ? `Pay $${plan.price}`
    : hasTrial
      ? 'Start free trial'
      : 'Subscribe'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    try {
      // Validate the form
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message || 'Please check your payment details')
        setSubmitting(false)
        return
      }

      if (isLifetime) {
        // Confirm PaymentIntent directly
        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url:
              window.location.origin + '/uplink/lifetime?payment=complete',
          },
          redirect: 'if_required',
        })
        if (confirmError) {
          setError(confirmError.message || 'Payment failed')
          setSubmitting(false)
          return
        }
        onSuccess()
      } else {
        // Confirm SetupIntent, then create subscription server-side
        const { error: confirmError, setupIntent: confirmedSi } =
          await stripe.confirmSetup({
            elements,
            confirmParams: {
              return_url:
                window.location.origin + '/uplink?setup=complete',
            },
            redirect: 'if_required',
          })
        if (confirmError) {
          setError(confirmError.message || 'Payment setup failed')
          setSubmitting(false)
          return
        }

        // Create the subscription on the backend
        if (confirmedSi && 'id' in confirmedSi && !isLifetimePlan(plan)) {
          await billingApi.confirmSubscription(
            confirmedSi.id,
            plan.priceId,
            getToken,
          )
        }
        onSuccess()
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(msg)
      onError(msg)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
        Payment method
      </h3>
      <PaymentElement
        options={{ layout: 'tabs' }}
        onReady={onReady}
      />
      {error && (
        <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
          <AlertTriangle size={14} className="text-error mt-0.5 shrink-0" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-content hover:bg-primary/90 active:scale-[0.98]"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Processing...
          </span>
        ) : (
          buttonLabel
        )}
      </button>
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-base-content/30">
        <Lock size={10} />
        <span>Secured by Stripe</span>
      </div>
    </form>
  )
}

// ── Order Summary ──────────────────────────────────────────────────

interface OrderSummaryProps {
  plan: PlanInfo
  hasTrial: boolean
  amount: number // in cents, from Stripe
  currency: string
}

function OrderSummary({ plan, hasTrial, amount, currency: _currency }: OrderSummaryProps) {
  const colors = TIER_COLORS[plan.tier]
  const isLifetime = isLifetimePlan(plan)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Order summary
        </h3>
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${colors.badge}`}
          >
            {plan.tier === 'lifetime' ? 'Founding Member' : plan.tier}
          </span>
        </div>
        <p className="text-base font-semibold text-base-content">
          {plan.name}
          {!isLifetime && ' Plan'}
        </p>
        <p className="text-xs text-base-content/40 mt-0.5">
          {isLifetime
            ? 'One-time payment — permanent access'
            : `${(plan as SubscriptionPlan).interval === 'annual' ? 'Annual' : 'Monthly'} billing`}
        </p>
      </div>

      <div className="border-t border-base-content/10 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-base-content/50">
            {isLifetime ? 'Lifetime Access' : `${plan.name} — ${(plan as SubscriptionPlan).interval}`}
          </span>
          <span className="text-sm font-semibold text-base-content">
            {formatCurrency(amount)}
            {!isLifetime &&
              `/${(plan as SubscriptionPlan).interval === 'annual' ? 'yr' : 'mo'}`}
          </span>
        </div>
        {!isLifetime && (plan as SubscriptionPlan).interval === 'annual' && (
          <p className="text-[10px] text-base-content/30 text-right mt-0.5">
            ${(plan as SubscriptionPlan).perMonth.toFixed(2)}/mo
          </p>
        )}
      </div>

      {hasTrial && !isLifetime && (
        <div className="bg-primary/5 border border-primary/15 rounded-lg p-3">
          <p className="text-xs font-semibold text-primary mb-1">
            7-day free trial
          </p>
          <p className="text-[10px] text-base-content/40 leading-relaxed">
            You won&apos;t be charged today. Your card will be charged{' '}
            {formatCurrency(amount)} on {trialEndDate(7)}.
          </p>
        </div>
      )}

      <div className="border-t border-base-content/10 pt-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-base-content/60">
          Due today
        </span>
        <span className={`text-lg font-bold ${colors.accent}`}>
          {hasTrial && !isLifetime ? '$0.00' : formatCurrency(amount)}
        </span>
      </div>
    </div>
  )
}

// ── Main Modal ─────────────────────────────────────────────────────

export default function CheckoutModal({
  plan,
  hasTrial,
  getToken,
  onSuccess,
  onClose,
}: CheckoutModalProps) {
  const [state, setState] = useState<CheckoutState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [setupIntent, setSetupIntent] = useState<SetupIntentResponse | null>(
    null,
  )
  const [paymentIntent, setPaymentIntent] =
    useState<PaymentIntentResponse | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const isLifetime = isLifetimePlan(plan)

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    requestAnimationFrame(() => dialogRef.current?.focus())
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Fetch intent on mount
  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError(null)

    const fetchIntent = async () => {
      try {
        if (isLifetime) {
          const res = await billingApi.createPaymentIntent(getToken)
          if (!cancelled) setPaymentIntent(res)
        } else {
          const res = await billingApi.createSetupIntent(
            (plan as SubscriptionPlan).priceId,
            getToken,
          )
          if (!cancelled) setSetupIntent(res)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to initialize checkout',
          )
          setState('idle')
        }
      }
    }

    fetchIntent()
    return () => {
      cancelled = true
    }
  }, [plan, isLifetime, getToken])

  // Build Elements options
  const elementsOptions: StripeElementsOptions | null =
    isLifetime && paymentIntent
      ? {
          clientSecret: paymentIntent.client_secret,
          appearance,
        }
      : !isLifetime && setupIntent
        ? {
            clientSecret: setupIntent.client_secret,
            appearance,
          }
        : null

  // Amount for order summary (in cents)
  const amount = isLifetime
    ? (paymentIntent?.amount ?? 39900)
    : (setupIntent?.amount ?? 0)
  const currency = isLifetime
    ? (paymentIntent?.currency ?? 'usd')
    : (setupIntent?.currency ?? 'usd')

  // Error state (intent creation failed)
  if (error && state !== 'ready') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Checkout error"
          tabIndex={-1}
          className="relative w-full max-w-md mx-4 bg-base-200 border border-error/30 rounded-xl p-8"
        >
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="absolute top-4 right-4 text-base-content/40 hover:text-base-content transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertTriangle size={32} className="text-error" />
            <h3 className="text-sm font-semibold text-error">
              Checkout Failed
            </h3>
            <p className="text-xs text-base-content/50">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 text-xs font-semibold border border-base-content/20 rounded-lg hover:bg-base-content/5 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isLifetime ? 'Lifetime purchase' : `Subscribe to ${plan.name}`}
        tabIndex={-1}
        className="relative w-full max-w-2xl mx-4 bg-base-200 border border-base-content/10 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-content/10">
          <h2 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            Checkout
          </h2>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="text-base-content/40 hover:text-base-content transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — two columns on md+, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-6 p-6">
          {/* Left: Order Summary */}
          <div className="pb-6 md:pb-0 md:pr-6 md:border-r border-b md:border-b-0 border-base-content/10">
            <OrderSummary
              plan={plan}
              hasTrial={hasTrial && !isLifetime}
              amount={amount}
              currency={currency}
            />
          </div>

          {/* Right: Payment Form */}
          <div className="pt-6 md:pt-0">
            {elementsOptions ? (
              <Elements stripe={stripePromise} options={elementsOptions}>
                <PaymentForm
                  plan={plan}
                  hasTrial={hasTrial}
                  setupIntent={setupIntent ?? undefined}
                  getToken={getToken}
                  onReady={() => setState('ready')}
                  onSuccess={() => {
                    setState('success')
                    onSuccess()
                  }}
                  onError={() => {}}
                />
              </Elements>
            ) : (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
