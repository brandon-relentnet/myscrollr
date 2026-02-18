import { useRef, useEffect, useState, useCallback } from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useTransform,
  useSpring,
} from 'motion/react'
import { Zap, Github, Globe } from 'lucide-react'
import InstallButton from '@/components/InstallButton'

/* ────────────────────────────────────────────────────────────────────────── */
/*  Constants                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const

const STREAMS = [
  { color: '#34d399', label: 'Finance' },
  { color: '#ff4757', label: 'Sports' },
  { color: '#00d4ff', label: 'News' },
  { color: '#a855f7', label: 'Fantasy' },
] as const

/** Floating particle positions — spread across the background */
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 3 + 1.5,
  delay: Math.random() * 5,
  duration: Math.random() * 6 + 8,
  streamIndex: i % 4,
}))

/* ────────────────────────────────────────────────────────────────────────── */
/*  Animated counter hook                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function useAnimatedCounter(target: number, isInView: boolean, suffix = '') {
  const [display, setDisplay] = useState('0' + suffix)
  const motionVal = useMotionValue(0)
  const springVal = useSpring(motionVal, { stiffness: 40, damping: 20 })

  useEffect(() => {
    if (isInView) {
      motionVal.set(target)
    }
  }, [isInView, target, motionVal])

  useEffect(() => {
    const unsub = springVal.on('change', (v) => {
      if (target >= 1000) {
        setDisplay(Math.round(v).toLocaleString() + suffix)
      } else {
        setDisplay(Math.round(v) + suffix)
      }
    })
    return unsub
  }, [springVal, target, suffix])

  return display
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Convergence Beam — a colored light ray pointing toward center            */
/* ────────────────────────────────────────────────────────────────────────── */

function ConvergenceBeam({
  angle,
  color,
  delay,
  isInView,
}: {
  angle: number
  color: string
  delay: number
  isInView: boolean
}) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 pointer-events-none"
      style={{
        width: '200%',
        height: 2,
        transformOrigin: 'left center',
        rotate: angle,
        x: '-50%',
        y: '-50%',
        background: `linear-gradient(90deg, transparent 0%, ${color}00 20%, ${color}40 50%, ${color}00 80%, transparent 100%)`,
        opacity: 0,
      }}
      initial={{ opacity: 0, scaleX: 0 }}
      animate={
        isInView
          ? {
              opacity: [0, 0.6, 0.3],
              scaleX: [0, 1, 1],
            }
          : {}
      }
      transition={{
        delay,
        duration: 2,
        ease: EASE,
      }}
    />
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pulse Ring — expanding ring from center                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function PulseRing({ delay, isInView }: { delay: number; isInView: boolean }) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 pointer-events-none"
      style={{ width: 280, height: 280, opacity: 0 }}
      animate={
        isInView
          ? {
              scale: [0.8, 2.5],
              opacity: [0.4, 0],
            }
          : {}
      }
      transition={{
        delay: 1.2 + delay,
        duration: 3,
        ease: 'easeOut',
        repeat: Infinity,
        repeatDelay: 1,
      }}
    />
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Main CTA Component                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export function CallToAction() {
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 })

  /* Mouse parallax for the ambient orb */
  const mouseX = useMotionValue(0.5)
  const mouseY = useMotionValue(0.5)
  const orbX = useTransform(mouseX, [0, 1], [-30, 30])
  const orbY = useTransform(mouseY, [0, 1], [-30, 30])
  const smoothOrbX = useSpring(orbX, { stiffness: 50, damping: 30 })
  const smoothOrbY = useSpring(orbY, { stiffness: 50, damping: 30 })

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      mouseX.set((e.clientX - rect.left) / rect.width)
      mouseY.set((e.clientY - rect.top) / rect.height)
    },
    [mouseX, mouseY],
  )

  /* Animated stats */
  const statsRef = useRef<HTMLDivElement>(null)
  const statsInView = useInView(statsRef, { once: true, amount: 0.5 })
  const usersCount = useAnimatedCounter(2500, statsInView, '+')
  const streamsCount = useAnimatedCounter(4, statsInView, '')
  const privacyCount = useAnimatedCounter(100, statsInView, '%')

  return (
    <section
      ref={sectionRef}
      className="relative overflow-clip py-32 lg:py-44"
      onMouseMove={handleMouseMove}
    >
      {/* ── Background layers ───────────────────────────────────────────── */}

      {/* Dark gradient base */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-100 via-base-200/80 to-base-100 pointer-events-none" />

      {/* Ambient gradient orb — follows mouse */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          left: '50%',
          top: '50%',
          x: smoothOrbX,
          y: smoothOrbY,
          translateX: '-50%',
          translateY: '-50%',
          background:
            'radial-gradient(circle, rgba(52,211,153,0.08) 0%, rgba(0,212,255,0.04) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Convergence beams — 4 colored light rays */}
      <div className="absolute inset-0 pointer-events-none">
        {STREAMS.map((stream, i) => (
          <ConvergenceBeam
            key={stream.label}
            angle={i * 90 + 45}
            color={stream.color}
            delay={0.3 + i * 0.15}
            isInView={isInView}
          />
        ))}
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: STREAMS[p.streamIndex].color,
              opacity: 0,
            }}
            animate={
              isInView
                ? {
                    y: [0, -80, -160],
                    opacity: [0, 0.5, 0],
                  }
                : {}
            }
            transition={{
              delay: p.delay,
              duration: p.duration,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          />
        ))}
      </div>

      {/* Pulse rings from center */}
      <PulseRing delay={0} isInView={isInView} />
      <PulseRing delay={1} isInView={isInView} />
      <PulseRing delay={2} isInView={isInView} />

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div
        className="relative mx-auto px-5 sm:px-6 lg:px-8"
        style={{ maxWidth: 1400 }}
      >
        <div className="flex flex-col items-center text-center">
          {/* Pill badge */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
              <Zap className="size-3" aria-hidden />
              Free forever. Open source. Zero tracking.
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h2
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{
              delay: 0.1,
              duration: 0.6,
              ease: EASE,
            }}
            className="mt-8 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-[0.9]"
          >
            <span className="block">Your Browser,</span>
            <span className="block mt-2 text-gradient-primary">
              Supercharged
            </span>
          </motion.h2>

          {/* Sub-copy */}
          <motion.span
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.25,
              duration: 0.5,
              ease: EASE,
            }}
            className="block mt-6 text-lg sm:text-xl text-base-content/50 max-w-lg leading-relaxed"
          >
            Live scores, real-time markets, breaking news, and fantasy updates.
            All in a single bar, pinned to every tab.
          </motion.span>

          {/* ── CTA button area with orbiting icons ─────────────────────── */}
          <motion.div
            className="relative mt-10"
            style={{ opacity: 0 }}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.4,
              duration: 0.6,
              ease: EASE,
            }}
          >
            {/* Central glow behind button */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{
                width: 200,
                height: 200,
                background:
                  'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)',
                filter: 'blur(30px)',
              }}
            />

            <InstallButton className="relative z-10 text-lg px-10 py-5 shadow-2xl" />
          </motion.div>

          {/* Browser support line */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
            className="mt-6 flex items-center gap-4 text-xs text-base-content/30"
          >
            {['Chrome', 'Firefox', 'Edge', 'Brave', 'Safari'].map((browser) => (
              <span key={browser} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                {browser}
              </span>
            ))}
          </motion.div>

          {/* ── Stats row ───────────────────────────────────────────────── */}
          <motion.div
            ref={statsRef}
            style={{ opacity: 0 }}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.7, duration: 0.5, ease: EASE }}
            className="mt-16 grid grid-cols-3 gap-8 sm:gap-16 max-w-lg w-full"
          >
            {[
              { value: usersCount, label: 'Happy users' },
              { value: streamsCount, label: 'Live streams' },
              { value: privacyCount, label: 'Private' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1"
              >
                <span className="text-2xl sm:text-3xl font-black text-base-content tracking-tight">
                  {stat.value}
                </span>
                <span className="text-xs text-base-content/35 font-medium">
                  {stat.label}
                </span>
              </div>
            ))}
          </motion.div>

          {/* ── Bottom links ────────────────────────────────────────────── */}
          <motion.div
            style={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.85, duration: 0.5, ease: EASE }}
            className="mt-12 flex items-center gap-6"
          >
            <a
              href="https://github.com/brandon-relentnet/scrollr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-base-content/40 hover:text-primary transition-[color] duration-200"
            >
              <Github className="size-4" aria-hidden />
              View Source
            </a>
            <span className="w-px h-4 bg-base-content/10" />
            <a
              href="https://myscrollr.com"
              className="inline-flex items-center gap-2 text-sm text-base-content/40 hover:text-primary transition-[color] duration-200"
            >
              <Globe className="size-4" aria-hidden />
              Learn More
            </a>
          </motion.div>
        </div>
      </div>

      {/* ── Bottom horizon glow ─────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none">
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--color-primary), var(--color-info), var(--color-primary), transparent)',
            opacity: 0,
          }}
          animate={isInView ? { opacity: [0, 0.4, 0.2] } : {}}
          transition={{ delay: 1.5, duration: 2 }}
        />
        <motion.div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: '60%',
            height: 120,
            background:
              'radial-gradient(ellipse at bottom, rgba(52,211,153,0.08) 0%, transparent 70%)',
            opacity: 0,
          }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.8, duration: 1.5 }}
        />
      </div>
    </section>
  )
}
