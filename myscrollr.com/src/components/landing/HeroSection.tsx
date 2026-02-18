import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { wrap } from 'motion'
import HeroTextSwap, { WORDS } from '@/components/Typewriter'
import { HeroBrowserStack } from '@/components/landing/HeroBrowserStack'
import InstallButton from '@/components/InstallButton'

const CYCLE_MS = 4000

export function HeroSection() {
  const [activeWordIndex, setActiveWordIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setActiveWordIndex((prev) => wrap(0, WORDS.length, prev + 1))
    }, CYCLE_MS)
  }, [])

  // Auto-cycle on mount
  useEffect(() => {
    startTimer()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startTimer])

  // Manual selection resets the timer
  const handleSelect = useCallback(
    (index: number) => {
      setActiveWordIndex(index)
      startTimer()
    },
    [startTimer],
  )

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section className="relative min-h-dvh flex items-center overflow-hidden">
      <div className="container relative">
        <div className="flex lg:flex-row flex-col justify-center items-center gap-12 lg:gap-20">
          {/* Stacked Browser Mockups */}
          <div className="relative order-2 lg:order-1">
            <HeroBrowserStack
              activeIndex={activeWordIndex}
              onSelect={handleSelect}
            />
          </div>

          {/* Hero Text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
            className="w-full lg:w-fit lg:min-w-140 order-1 lg:order-2"
          >
            <HeroTextSwap activeIndex={activeWordIndex} />

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="text-base text-base-content/50 max-w-md leading-relaxed"
            >
              Pin live sports scores, crypto prices, and custom feeds over any
              tab.{' '}
              <span className="text-primary font-medium">
                Never alt-tab again.
              </span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="flex flex-wrap gap-4 mt-10"
            >
              <InstallButton />
              <motion.button
                type="button"
                whileHover={{
                  y: 2,
                  transition: { type: 'tween', duration: 0.2 },
                }}
                whileTap={{ y: 0 }}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-200/50 px-6 py-3 text-sm font-semibold text-base-content hover:bg-base-300 transition-colors backdrop-blur-sm"
                onClick={() => scrollToSection('how-it-works')}
              >
                How It Works
              </motion.button>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-3 text-base-content/40"
      >
        <span className="text-xs text-base-content/40">Scroll</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-5 h-8 rounded-full border-2 border-current flex justify-center pt-2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1 h-1 rounded-full bg-current"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
