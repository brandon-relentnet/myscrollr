import { useState, useEffect } from 'react'
import {
  billingApi,
  getPreferences,
  type SubscriptionStatus as SubStatus,
} from '@/api/client'
import { Crown, Loader2, AlertTriangle, Calendar, Infinity } from 'lucide-react'

interface SubscriptionStatusProps {
  getToken: () => Promise<string | null>
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  lifetime: 'Lifetime',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  none: { label: 'No Subscription', color: 'text-base-content/40' },
  active: { label: 'Active', color: 'text-success' },
  canceling: { label: 'Canceling', color: 'text-warning' },
  canceled: { label: 'Canceled', color: 'text-error' },
  past_due: { label: 'Past Due', color: 'text-error' },
}

export default function SubscriptionStatus({ getToken }: SubscriptionStatusProps) {
  const [subscription, setSubscription] = useState<SubStatus | null>(null)
  const [tier, setTier] = useState<string>('free')
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isUnlimited = tier === 'uplink_unlimited'

  useEffect(() => {
    loadSubscription()
  }, [])

  async function loadSubscription() {
    try {
      setLoading(true)
      const [sub, prefs] = await Promise.all([
        billingApi.getSubscription(getToken),
        getPreferences(getToken).catch(() => null),
      ])
      setSubscription(sub)
      if (prefs?.subscription_tier) setTier(prefs.subscription_tier)
    } catch {
      setError('Failed to load subscription')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel? You will keep access until the end of your billing period.')) {
      return
    }
    try {
      setCanceling(true)
      await billingApi.cancelSubscription(getToken)
      await loadSubscription()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 size={14} className="animate-spin text-base-content/30" />
        <span className="text-xs text-base-content/30">
          Loading subscription...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4">
        <AlertTriangle size={14} className="text-error" />
        <span className="text-xs text-error">{error}</span>
      </div>
    )
  }

  if (!subscription || subscription.plan === 'free') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Crown size={14} className="text-base-content/30" />
          <span className="text-xs font-semibold text-base-content/40">
            Free Tier
          </span>
        </div>
        <p className="text-xs text-base-content/30">
          Upgrade to Uplink for faster polling, or Unlimited for real-time SSE.
        </p>
      </div>
    )
  }

  const statusInfo = STATUS_LABELS[subscription.status] || STATUS_LABELS.none
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null

  return (
    <div className={`space-y-4 ${isUnlimited ? 'unlimited-glow rounded-xl p-4 -m-4' : ''}`}
      style={isUnlimited ? { background: 'rgba(52, 211, 153, 0.03)', borderColor: 'rgba(52, 211, 153, 0.15)' } : undefined}
    >
      {/* Plan + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown
            size={14}
            className={isUnlimited ? 'text-primary unlimited-dot-glow rounded-full' : 'text-primary'}
          />
          <span className={`text-xs font-semibold text-primary ${isUnlimited ? 'unlimited-text-glow' : ''}`}>
            {isUnlimited ? 'Uplink Unlimited' : 'Uplink'}{' '}
            {PLAN_LABELS[subscription.plan] || subscription.plan}
          </span>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Period End / Lifetime */}
      {subscription.lifetime ? (
        <div className="flex items-center gap-2">
          <Infinity size={12} className="text-base-content/30" />
          <span className="text-xs text-base-content/40">Lifetime access — no expiration</span>
        </div>
      ) : periodEnd ? (
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-base-content/30" />
          <span className="text-xs text-base-content/40">
            {subscription.status === 'canceling'
              ? `Access until ${periodEnd.toLocaleDateString()}`
              : `Renews ${periodEnd.toLocaleDateString()}`}
          </span>
        </div>
      ) : null}

      {/* Cancel Button (only for active non-lifetime) */}
      {subscription.status === 'active' && !subscription.lifetime && (
        <button
          onClick={handleCancel}
          disabled={canceling}
          className="w-full py-2 text-[10px] font-semibold border border-base-content/10 rounded-lg
                     text-base-content/30 hover:text-error hover:border-error/30 transition-colors disabled:opacity-50"
        >
          {canceling ? 'Canceling...' : 'Cancel Subscription'}
        </button>
      )}
    </div>
  )
}
