import { useState, useCallback, useEffect, useRef } from 'react'
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { billingApi } from '@/api/client'
import { X, Loader2, AlertTriangle } from 'lucide-react'

// Lazy-load Stripe once using the publishable key from env
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
)

interface CheckoutFormProps {
  priceId?: string
  isLifetime?: boolean
  getToken: () => Promise<string | null>
  onClose: () => void
  onSuccess?: () => void
}

/**
 * CheckoutForm wraps Stripe's EmbeddedCheckout in a modal overlay.
 * It creates a checkout session on mount and renders the Stripe-hosted
 * payment form inside an embedded component.
 */
export default function CheckoutForm({
  priceId,
  isLifetime = false,
  getToken,
  onClose,
}: CheckoutFormProps) {
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    // Focus the dialog on mount
    requestAnimationFrame(() => dialogRef.current?.focus())
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const fetchClientSecret = useCallback(async () => {
    try {
      const response = isLifetime
        ? await billingApi.createLifetimeCheckout(getToken)
        : await billingApi.createCheckoutSession(priceId!, getToken)

      return response.client_secret
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create checkout session'
      setError(message)
      throw err
    }
  }, [priceId, isLifetime, getToken])

  if (error) {
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
        ref={error ? undefined : dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          isLifetime ? 'Lifetime purchase checkout' : 'Subscribe to Uplink'
        }
        tabIndex={-1}
        className="relative w-full max-w-lg mx-4 bg-base-200 border border-base-content/10 rounded-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-content/10">
          <h3 className="text-xs font-semibold text-base-content/60">
            {isLifetime ? 'Lifetime Purchase' : 'Subscribe to Uplink'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="text-base-content/40 hover:text-base-content transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-1 min-h-[400px]">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>
  )
}

/**
 * CheckoutLoading renders a loading indicator while the checkout session is being created.
 */
export function CheckoutLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 size={24} className="animate-spin text-primary" />
      <p className="text-xs text-base-content/40">
        Initializing secure checkout...
      </p>
    </div>
  )
}
