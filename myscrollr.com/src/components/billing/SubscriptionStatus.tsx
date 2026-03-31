import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, Calendar, Clock, CreditCard, Crown, Infinity, Loader2, Zap } from 'lucide-react'
import type { SubscriptionStatus as SubStatus } from '@/api/client'
import {
  billingApi,
  getPreferences,
} from '@/api/client'

interface SubscriptionStatusProps {
  getToken: () => Promise<string | null>
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  monthly: 'Monthly',
  annual: 'Annual',
  lifetime: 'Lifetime',
  pro_monthly: 'Monthly',
  pro_annual: 'Annual',
  ultimate_monthly: 'Monthly',
  ultimate_annual: 'Annual',
}

const PLAN_PRICES: Record<string, string> = {
  monthly: '$9.99/mo',
  annual: '$79.99/yr',
  pro_monthly: '$24.99/mo',
  pro_annual: '$199.99/yr',
  ultimate_monthly: '$49.99/mo',
  ultimate_annual: '$399.99/yr',
  lifetime: '$399 one-time',
}

const DOWNGRADE_PLAN_NAMES: Record<string, string> = {
  monthly: 'Uplink',
  annual: 'Uplink',
  pro_monthly: 'Uplink Pro',
  pro_annual: 'Uplink Pro',
  ultimate_monthly: 'Uplink Ultimate',
  ultimate_annual: 'Uplink Ultimate',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  none: { label: 'No Subscription', color: 'text-base-content/40' },
  active: { label: 'Active', color: 'text-success' },
  canceling: { label: 'Canceling', color: 'text-warning' },
  canceled: { label: 'Canceled', color: 'text-error' },
  past_due: { label: 'Past Due', color: 'text-error' },
  trialing: { label: 'Free Trial', color: 'text-info' },
}

export default function SubscriptionStatus({
  getToken,
}: SubscriptionStatusProps) {
  const [subscription, setSubscription] = useState<SubStatus | null>(null)
  const [tier, setTier] = useState<string>('free')
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derive tier from both JWT-based preferences AND the plan string directly
  // (plan updates immediately in DB, JWT roles may take a few seconds to sync)
  const isUltimate =
    tier === 'uplink_ultimate' ||
    subscription?.plan === 'ultimate_monthly' ||
    subscription?.plan === 'ultimate_annual'
  const isPro =
    tier === 'uplink_pro' ||
    subscription?.plan === 'pro_monthly' ||
    subscription?.plan === 'pro_annual'

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

  async function handleOpenPortal() {
    try {
      setOpeningPortal(true)
      const { url } = await billingApi.createPortalSession(getToken)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal')
      setOpeningPortal(false)
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        'Are you sure you want to cancel? You will keep access until the end of your billing period.',
      )
    ) {
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
          Upgrade to Uplink for faster polling, or Uplink Ultimate for real-time SSE.
        </p>
      </div>
    )
  }

  const statusInfo = STATUS_LABELS[subscription.status] || STATUS_LABELS.none
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null

  return (
    <div
      className={`space-y-4 ${isUltimate ? 'unlimited-glow rounded-xl p-4 -m-4' : ''}`}
      style={
        isUltimate
          ? {
              background: 'rgba(52, 211, 153, 0.03)',
              borderColor: 'rgba(52, 211, 153, 0.15)',
            }
          : undefined
      }
    >
      {/* Plan + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown
            size={14}
            className={
              isUltimate
                ? 'text-primary unlimited-dot-glow rounded-full'
                : 'text-primary'
            }
          />
          <span
            className={`text-xs font-semibold text-primary ${isUltimate ? 'unlimited-text-glow' : ''}`}
          >
            {isUltimate ? 'Uplink Ultimate' : isPro ? 'Uplink Pro' : 'Uplink'}{' '}
            {PLAN_LABELS[subscription.plan] || subscription.plan}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Billing Price */}
      {PLAN_PRICES[subscription.plan] && (
        <div className="flex items-center gap-2">
          <CreditCard size={12} className="text-base-content/30" />
          <span className="text-xs text-base-content/40">
            {PLAN_PRICES[subscription.plan]}
            {subscription.plan.includes('monthly')
              ? ' · Monthly billing'
              : subscription.plan.includes('annual')
                ? ' · Annual billing'
                : ''}
            {subscription.status === 'trialing' && subscription.trial_end
              ? ` starting ${new Date(subscription.trial_end * 1000).toLocaleDateString()}`
              : ''}
          </span>
        </div>
      )}

      {/* Trial: full Ultimate access note */}
      {subscription.status === 'trialing' && (
        <div className="flex items-center gap-2 py-2 px-3 bg-info/5 border border-info/15 rounded-lg">
          <Zap size={12} className="text-info shrink-0" />
          <span className="text-[10px] text-base-content/50">
            Your trial includes full <span className="font-semibold text-base-content/70">Uplink Ultimate</span> access.
          </span>
        </div>
      )}

      {/* Period End / Lifetime */}
      {subscription.lifetime ? (
        <div className="flex items-center gap-2">
          <Infinity size={12} className="text-base-content/30" />
          <span className="text-xs text-base-content/40">
            Lifetime access — no expiration
          </span>
        </div>
      ) : subscription.status === 'canceled' ? (
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-base-content/30" />
          <span className="text-xs text-base-content/40">
            Your subscription has ended. Resubscribe to restore your plan.
          </span>
        </div>
      ) : periodEnd ? (
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-base-content/30" />
          <span className="text-xs text-base-content/40">
            {subscription.status === 'canceling'
              ? `Access until ${periodEnd.toLocaleDateString()}`
              : subscription.status === 'trialing'
                ? `Trial ends ${periodEnd.toLocaleDateString()} — billing starts after`
                : `Renews ${periodEnd.toLocaleDateString()}`}
          </span>
        </div>
      ) : null}

      {/* Pending Downgrade Notice */}
      {subscription.pending_downgrade_plan &&
        subscription.scheduled_change_at && (
          <div className="flex items-center gap-2 py-2 px-3 bg-warning/5 border border-warning/15 rounded-lg">
            <AlertTriangle size={12} className="text-warning shrink-0" />
            <span className="text-[10px] text-base-content/50">
              Switching to{' '}
              <span className="font-semibold text-base-content/70">
                {DOWNGRADE_PLAN_NAMES[subscription.pending_downgrade_plan] ||
                  subscription.pending_downgrade_plan}
              </span>{' '}
              on{' '}
              {new Date(
                subscription.scheduled_change_at,
              ).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              · your current plan remains active until then.
            </span>
          </div>
        )}

      {/* Past Due Warning */}
      {subscription.status === 'past_due' && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-error/10 border border-error/20">
          <AlertTriangle size={14} className="text-error shrink-0" />
          <span className="text-[10px] text-error/80">
            Your payment failed. Update your payment method to avoid service interruption.
          </span>
        </div>
      )}

      {/* Trial Days Remaining */}
      {subscription.status === 'trialing' && subscription.trial_end && (
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-info" />
          <span className="text-xs text-info font-medium">
            {(() => {
              const days = Math.max(0, Math.ceil((subscription.trial_end * 1000 - Date.now()) / 86_400_000))
              return `${days} day${days !== 1 ? 's' : ''} remaining in trial`
            })()}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {/* Past due: update payment */}
        {subscription.status === 'past_due' && !subscription.lifetime && (
          <button
            onClick={handleOpenPortal}
            disabled={openingPortal}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border border-error/30 rounded-lg
                       text-error hover:bg-error/10 transition-colors disabled:opacity-50"
          >
            <CreditCard size={10} />
            {openingPortal ? 'Opening...' : 'Update Payment Method'}
          </button>
        )}

        {/* Active / Trialing: manage, change plan, cancel */}
        {(subscription.status === 'active' || subscription.status === 'trialing') && !subscription.lifetime && (
          <>
            <button
              onClick={handleOpenPortal}
              disabled={openingPortal}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border border-base-content/10 rounded-lg
                         text-base-content/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50"
            >
              <CreditCard size={10} />
              {openingPortal ? 'Opening...' : 'Manage Subscription'}
            </button>
            <Link
              to="/uplink"
              search={{ session_id: undefined }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border border-base-content/10 rounded-lg
                         text-base-content/40 hover:text-primary hover:border-primary/30 transition-colors"
            >
              Change Plan <ArrowRight size={10} />
            </Link>
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="flex-1 py-2 text-[10px] font-semibold border border-base-content/10 rounded-lg
                         text-base-content/30 hover:text-error hover:border-error/30 transition-colors disabled:opacity-50"
            >
              {canceling ? 'Canceling...' : 'Cancel Subscription'}
            </button>
          </>
        )}

        {/* Canceling: manage (to resume) + change plan */}
        {subscription.status === 'canceling' && !subscription.lifetime && (
          <>
            <button
              onClick={handleOpenPortal}
              disabled={openingPortal}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border border-base-content/10 rounded-lg
                         text-base-content/40 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50"
            >
              <CreditCard size={10} />
              {openingPortal ? 'Opening...' : 'Resume Subscription'}
            </button>
            <Link
              to="/uplink"
              search={{ session_id: undefined }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border border-base-content/10 rounded-lg
                         text-base-content/40 hover:text-primary hover:border-primary/30 transition-colors"
            >
              Change Plan <ArrowRight size={10} />
            </Link>
          </>
        )}

        {/* Canceled: resubscribe */}
        {subscription.status === 'canceled' && !subscription.lifetime && (
          <Link
            to="/uplink"
            search={{ session_id: undefined }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold border border-primary/30 rounded-lg
                       text-primary hover:bg-primary/10 transition-colors"
          >
            <Crown size={10} />
            Resubscribe <ArrowRight size={10} />
          </Link>
        )}
      </div>
    </div>
  )
}
