import * as motion from 'motion/react-client'

/**
 * PULSE Logo - Abstract EKG/Heartbeat Line
 * Fits the trading terminal aesthetic
 */
export function ScrollrSVG({ width = 48, height = 48, className = '' }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Gradient for the pulse line */}
        <linearGradient id="pulseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-primary, #bfff00)" />
          <stop offset="50%" stopColor="var(--color-info, #00d4ff)" />
          <stop offset="100%" stopColor="var(--color-secondary, #ff4757)" />
        </linearGradient>

        {/* Glow filter */}
        <filter id="pulseGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background circle (optional - subtle) */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="var(--color-base-300, #1e1e28)"
        strokeWidth="1"
        opacity="0.5"
      />

      {/* Pulse/EKG Line */}
      <motion.path
        d="M10 50 L25 50 L30 35 L40 65 L45 40 L50 50 L60 50 L70 30 L80 70 L85 45 L90 50 L95 50"
        fill="none"
        stroke="url(#pulseGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#pulseGlow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          duration: 1.5,
          ease: 'easeInOut',
        }}
      />

      {/* Animated pulse dot at the end */}
      <motion.circle
        cx="95"
        cy="50"
        r="4"
        fill="var(--color-primary, #bfff00)"
        filter="url(#pulseGlow)"
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </svg>
  )
}

export default ScrollrSVG
