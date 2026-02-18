import { AnimatePresence, motion } from 'motion/react'

export const WORDS = ['Scores', 'Markets', 'Headlines', 'Leagues'] as const

interface HeroTextSwapProps {
  activeIndex: number
}

export default function HeroTextSwap({ activeIndex }: HeroTextSwapProps) {
  return (
    <div className="text-center lg:text-left">
      {/* Your [word], */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight leading-none"
      >
        <span className="text-base-content">Your </span>
        <span className="inline-block relative">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={WORDS[activeIndex]}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 50,
              }}
              className="inline-block text-rainbow pb-[0.15em]"
            >
              {WORDS[activeIndex]}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.div>

      {/* Uninterrupted. */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
        className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight leading-none -mt-1"
      >
        <span className="italic text-base-content/60">Uninterrupted.</span>
      </motion.div>


    </div>
  )
}
