import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  Shield,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react'

import { usePageMeta } from '@/lib/usePageMeta'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useGetToken } from '@/hooks/useGetToken'
import { billingApi } from '@/api/client'

const CheckoutForm = lazy(() => import('@/components/billing/CheckoutForm'))

// ── Signature easing (matches homepage) ────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

// ── Warning hex for inline style accents ───────────────────────
const HEX_WARNING = '#f59e0b'

export const Route = createFileRoute('/uplink_/lifetime')({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: (search.session_id as string) || undefined,
  }),
  component: LifetimePage,
})

// ── Feature line ────────────────────────────────────────────────
function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Check size={14} className="text-warning shrink-0" />
      <span className="text-xs text-base-content/60">{children}</span>
    </div>
  )
}

// ── Page Component ──────────────────────────────────────────────
function LifetimePage() {
  usePageMeta({
    title: 'Lifetime Uplink — Scrollr',
    description:
      'Permanent Uplink access. One payment, forever. Only 128 founding member slots available.',
    canonicalUrl: 'https://myscrollr.com/uplink/lifetime',
  })

  const { isAuthenticated, signIn } = useScrollrAuth()
  const getToken = useGetToken()
  const navigate = useNavigate()
  const { session_id } = Route.useSearch()

  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)

  // Handle return from Stripe checkout via ?session_id=
  useEffect(() => {
    if (!session_id) return
    setCheckingSession(true)
    billingApi
      .getCheckoutReturn(session_id, getToken)
      .then((res) => {
        if (res.status === 'complete') {
          setCheckoutSuccess(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        setCheckingSession(false)
        navigate({
          to: '/uplink/lifetime',
          search: { session_id: undefined },
          replace: true,
        })
      })
  }, [session_id, getToken, navigate])

  const handlePurchase = () => {
    if (!isAuthenticated) {
      signIn(window.location.origin + '/uplink/lifetime')
      return
    }
    setShowCheckout(true)
  }

  return (
    <div className="min-h-screen pt-20">
      {/* ── Checkout Modal ──────────────────────────────────── */}
      {showCheckout && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          }
        >
          <CheckoutForm
            isLifetime
            getToken={getToken}
            onClose={() => setShowCheckout(false)}
          />
        </Suspense>
      )}

      {/* ── Success Banner ──────────────────────────────────── */}
      {checkoutSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-40 px-6 py-4 bg-warning/10 border border-warning/30 rounded-lg backdrop-blur-sm flex items-center gap-3"
        >
          <CheckCircle2 size={18} className="text-warning" />
          <div>
            <p className="text-xs font-semibold text-warning">
              Lifetime Uplink Activated
            </p>
            <p className="text-[10px] text-base-content/40">
              Welcome, founding member. Your access is permanent.
            </p>
          </div>
          <button
            onClick={() => setCheckoutSuccess(false)}
            className="ml-4 text-base-content/30 hover:text-base-content/60 transition-colors text-xs"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* ── Session Checking ────────────────────────────────── */}
      {checkingSession && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 px-6 py-3 bg-base-200/90 border border-base-content/10 rounded-lg backdrop-blur-sm flex items-center gap-3">
          <Loader2 size={14} className="animate-spin text-warning" />
          <span className="text-[10px] text-base-content/40">
            Confirming payment...
          </span>
        </div>
      )}

      {/* ================================================================
          HERO
          ================================================================ */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        {/* Layered background system */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Fine dot matrix */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, var(--grid-dot-warning) 1px, transparent 0)`,
              backgroundSize: '24px 24px',
            }}
          />

          {/* Primary orbital glow */}
          <motion.div
            className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(245, 158, 11, 0.04) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Secondary glow */}
          <motion.div
            className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(245, 158, 11, 0.02) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1.08, 1, 1.08],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Top border accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-warning/20 to-transparent" />

        <div className="container relative z-10 !py-0">
          {/* Back link */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <Link
              to="/uplink"
              search={{ session_id: undefined }}
              className="inline-flex items-center gap-2 text-[10px] text-base-content/30 hover:text-base-content/50 transition-colors mb-12"
            >
              <ArrowLeft size={12} /> Back to Uplink
            </Link>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left — Copy */}
            <div>
              {/* Badge row */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="flex items-center gap-3 mb-8"
              >
                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-warning/8 text-warning text-[10px] font-semibold rounded-lg border border-warning/15 uppercase tracking-wide">
                  <Sparkles size={12} />
                  The First Byte
                </span>
                <span className="h-px w-12 bg-gradient-to-r from-warning/30 to-transparent" />
                <span className="text-[10px] text-base-content/20 uppercase tracking-wide">
                  Founding Member
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
                className="text-5xl md:text-7xl font-black tracking-tight leading-[0.9] mb-6"
              >
                One Payment
                <br />
                <span className="text-warning">Forever</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
                className="text-sm text-base-content/40 leading-relaxed max-w-md mb-10"
              >
                Lifetime Uplink is a one-time payment for permanent Uplink-tier
                access. No renewals, no expiry. Only 128 founding member slots
                will ever be created — 0x00 through 0x7F. Want real-time SSE?
                Add Unlimited at 50% off.
              </motion.p>

              {/* Feature list */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
                className="space-y-3 mb-10"
              >
                <Feature>Permanent Uplink-tier access (30s polling)</Feature>
                <Feature>25 symbols, 50 RSS feeds, 3 fantasy leagues</Feature>
                <Feature>Pro + College sports, blacklist filtering</Feature>
                <Feature>Early access to new features & channels</Feature>
                <Feature>Founding member badge & priority support</Feature>
                <Feature>50% off any Unlimited subscription</Feature>
              </motion.div>
            </div>

            {/* Right — Purchase Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
              className="relative"
            >
              {/* Outer glow */}
              <motion.div
                className="absolute -inset-px rounded-2xl bg-gradient-to-b from-warning/20 via-warning/5 to-transparent"
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              <div className="relative bg-base-200/80 backdrop-blur-sm border border-warning/20 rounded-2xl overflow-hidden">
                {/* Top accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${HEX_WARNING} 50%, transparent)`,
                  }}
                />

                {/* Ambient gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-warning/[0.03] to-transparent pointer-events-none" />

                {/* Corner dot grid */}
                <div
                  className="absolute top-0 right-0 w-24 h-24 opacity-[0.04] text-base-content"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '8px 8px',
                  }}
                />

                {/* Watermark icon */}
                <Crown
                  size={140}
                  strokeWidth={0.4}
                  className="absolute -bottom-6 -right-6 text-base-content/[0.025] pointer-events-none"
                />

                <div className="relative z-10 p-8 lg:p-10">
                  {/* Icon badge + slot count */}
                  <div className="flex items-center justify-between mb-8">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${HEX_WARNING}15`,
                        boxShadow: `0 0 20px ${HEX_WARNING}15, 0 0 0 1px ${HEX_WARNING}20`,
                      }}
                    >
                      <Crown size={24} className="text-base-content/80" />
                    </div>
                    <span className="text-[9px] text-warning/50 uppercase tracking-wide">
                      128 Slots Total
                    </span>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black text-base-content tracking-tight">
                        $549
                      </span>
                      <span className="text-sm text-base-content/25">
                        one-time
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-warning/40 mb-4">
                    Equivalent to ~5.1 years of Uplink Monthly at $8.99/mo
                  </p>

                  {/* Unlimited upgrade callout — with aura */}
                  <div className="relative mb-8 p-3 rounded-xl border border-primary/15 overflow-hidden unlimited-glow"
                    style={{ background: 'rgba(52, 211, 153, 0.04)' }}
                  >
                    {/* Smoke layer — left bloom */}
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(ellipse 80% 70% at 15% 50%, #34d39914 0%, transparent 70%)',
                      }}
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    {/* Smoke layer — right bloom */}
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(ellipse 60% 80% at 85% 50%, #34d39910 0%, transparent 65%)',
                      }}
                      animate={{ opacity: [0.2, 0.55, 0.2] }}
                      transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: 1,
                      }}
                    />
                    {/* Accent top line */}
                    <div
                      className="absolute top-0 left-0 right-0 h-px"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent, #34d399 50%, transparent)',
                      }}
                    />
                    <div className="relative z-10">
                      <p className="text-[10px] text-primary/70 font-semibold mb-1">
                        Want real-time SSE?
                      </p>
                      <p className="text-[10px] text-base-content/35 leading-relaxed">
                        Lifetime members get 50% off any Unlimited subscription.
                        Add real-time delivery, unlimited limits, and extended
                        retention starting at $12.50/mo.
                      </p>
                    </div>
                  </div>

                  {/* Slot progress (marketing) */}
                  <div className="mb-8 p-4 rounded-xl bg-base-100/60 border border-base-300/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] text-base-content/30 uppercase tracking-wide">
                        Available Slots
                      </span>
                      <span className="text-xs font-mono text-warning/60 font-bold">
                        128 / 128
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-base-300/50 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-warning/60 to-primary/60 origin-left"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: 1.5,
                          delay: 0.5,
                          ease: EASE,
                        }}
                      />
                    </div>
                  </div>

                  {/* Purchase button */}
                  <button
                    type="button"
                    onClick={handlePurchase}
                    className="btn btn-lg w-full gap-2.5 bg-warning/10 border-warning/30 text-warning hover:bg-warning/20 hover:border-warning/50"
                  >
                    <Sparkles size={14} />
                    {isAuthenticated
                      ? 'Purchase Lifetime Access'
                      : 'Sign In to Purchase'}
                  </button>

                  {/* Trust signals */}
                  <div className="mt-6 flex items-center justify-center gap-6">
                    <span className="flex items-center gap-1.5 text-[9px] text-base-content/20">
                      <Shield size={10} /> Stripe Secured
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] text-base-content/20">
                      <Star size={10} /> No Renewals
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] text-base-content/20">
                      <Zap size={10} /> Instant Access
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-base-300/50 to-transparent" />
      </section>
    </div>
  )
}
