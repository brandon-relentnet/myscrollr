import * as motion from 'motion/react-client'

export default function TypewriterChangeContentExample() {
  return (
    <div className="text-center lg:text-left">
      {/* Your Feed, */}
      <div className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-none overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-base-content relative inline-block">
            Your Feed,
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -right-4 top-1/2 -translate-y-1/2 w-2 h-8 sm:h-10 bg-primary rounded-sm"
            />
          </span>
        </motion.div>
      </div>

      {/* Uninterrupted. */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
        className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-none mt-2"
      >
        <span className="text-rainbow relative inline-block">
          Uninterrupted.
          <motion.span
            animate={{
              opacity: [0, 1, 0],
              scale: [1, 1.2, 1],
            }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute -right-6 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gradient-to-r from-primary to-info"
          />
        </span>
      </motion.div>

      {/* Decorative underline */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8, ease: 'anticipate' }}
        className="h-1 w-32 bg-gradient-to-r from-primary via-info to-secondary rounded-full mt-6 mx-auto lg:mx-0"
      />
    </div>
  )
}
