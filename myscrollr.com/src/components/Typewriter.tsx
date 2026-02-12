import { Typewriter } from 'motion-plus/react'
import { motion } from 'motion/react'
import { delay, wrap } from 'motion'
import { useState } from 'react'

const WORDS = [
  'Scores',
  'Markets',
  'Headlines',
  'Leagues',
  'Feed',
]

export default function HeroTypewriter() {
  const [index, setIndex] = useState(0)

  return (
    <div className="text-center lg:text-left">
      {/* Your [word], */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-none overflow-hidden"
      >
        <span className="text-base-content">Your </span>
        <Typewriter
          as="span"
          cursorStyle={{
            background: 'var(--color-primary)',
            width: 3,
            height: '1.1em',
            marginLeft: 2,
          }}
          onComplete={() => {
            delay(() => setIndex(wrap(0, WORDS.length, index + 1)), 2)
          }}
          className="text-gradient-primary"
        >
          {WORDS[index]}
        </Typewriter>
        <span className="text-base-content">,</span>
      </motion.div>

      {/* Uninterrupted. */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
        className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-none mt-2"
      >
        <span className="text-rainbow">Uninterrupted.</span>
      </motion.div>

      {/* Decorative underline */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8, ease: 'anticipate' }}
        className="h-1 w-32 bg-linear-to-r from-primary via-info to-secondary rounded-full my-6 mx-auto lg:mx-0"
      />
    </div>
  )
}
