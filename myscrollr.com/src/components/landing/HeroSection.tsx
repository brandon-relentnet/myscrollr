import { motion } from 'motion/react'
import TypewriterChangeContentExample from '@/components/Typewriter'
import ScrollrSVG from '@/components/ScrollrSVG'
import InstallButton from '@/components/InstallButton'

export function HeroSection() {
  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20 z-10">
      <div className="container relative z-10">
        <div className="flex lg:flex-row flex-col justify-center items-center gap-12 lg:gap-20">
          {/* Abstract Pulse Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="relative order-2 lg:order-1"
          >
            {/* Decorative glow */}
            <div className="absolute inset-0 bg-primary/10 rounded-full blur-[100px]" />

            {/* Large animated pulse */}
            <motion.div
              animate={{
                scale: [1, 1.02, 1],
                rotate: [0, 0.3, 0, -0.3, 0],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative"
            >
              <ScrollrSVG
                width={400}
                height={400}
                className="w-64 h-64 lg:w-96 lg:h-96"
              />
            </motion.div>

            {/* Floating data indicators */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: { duration: 0.5, delay: 0.6 },
              }}
              whileHover={{
                scale: 1.05,
                rotate: 2,
                transition: { duration: 0.2 },
              }}
              className="absolute top-8 -right-4 px-4 py-2.5 rounded-sm border border-primary/40 bg-base-200/90 backdrop-blur-sm shadow-lg cursor-default"
            >
              <span className="flex items-center gap-2.5 text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-xs font-bold font-mono uppercase tracking-wider">
                  LIVE
                </span>
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: { duration: 0.5, delay: 0.7 },
              }}
              whileHover={{
                scale: 1.05,
                rotate: -2,
                transition: { duration: 0.2 },
              }}
              className="absolute bottom-24 -left-2 px-4 py-2.5 rounded-sm border border-info/40 bg-base-200/90 backdrop-blur-sm shadow-lg cursor-default"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-sm font-bold font-mono text-info">
                  +2.47%
                </span>
                <span className="text-xs font-mono text-base-content/50 uppercase tracking-wider">
                  BTC
                </span>
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: { duration: 0.5, delay: 0.8 },
              }}
              whileHover={{
                scale: 1.05,
                rotate: 2,
                transition: { duration: 0.2 },
              }}
              className="absolute bottom-6 right-8 px-4 py-2.5 rounded-sm border border-secondary/40 bg-base-200/90 backdrop-blur-sm shadow-lg cursor-default"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-sm font-bold font-mono text-secondary">
                  Q4 2:34
                </span>
                <span className="text-xs font-mono text-base-content/50 uppercase tracking-wider">
                  LAL
                </span>
              </span>
            </motion.div>
          </motion.div>

          {/* Hero Text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
            className="w-fit min-w-140 order-1 lg:order-2"
          >
            <TypewriterChangeContentExample />

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="mt-8 text-lg sm:text-xl text-base-content/60 max-w-md leading-relaxed"
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
                whileHover={{ y: 2, transition: { type: 'tween', duration: 0.2 } }}
                whileTap={{ y: 0 }}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-base-300 bg-base-200/50 px-6 py-3 text-sm font-bold uppercase tracking-wider text-base-content hover:bg-base-300 transition-colors backdrop-blur-sm"
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
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-base-content/40"
      >
        <span className="text-xs font-mono uppercase tracking-widest">
          Scroll
        </span>
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
