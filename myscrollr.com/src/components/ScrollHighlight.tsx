import { motion, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

interface FeatureItem {
  name: string
  subtitle: string
  description: string
  data?: {
    labels: Array<string>
    values: Array<string>
    type: 'chart' | 'scores' | 'ticker'
  }
}

const features: Array<FeatureItem> = [
  {
    name: 'Sports',
    subtitle: 'Live Scores & Fantasy',
    description:
      'Real-time NBA, NFL, and fantasy sports updates. Never miss a score while you work or stream.',
    data: {
      type: 'scores',
      labels: ['LAL', 'BOS', 'MIA', 'GSW'],
      values: ['118-112', '98-89', 'Ovr 3rd', 'Q4 8:23'],
    },
  },
  {
    name: 'Finance',
    subtitle: 'Stocks & Crypto',
    description:
      'Track BTC, ETH, and your portfolio in real-time. Green and red indicators for market moves.',
    data: {
      type: 'chart',
      labels: ['BTC', 'ETH', 'SPY', 'NVDA'],
      values: ['$67.2K', '$3.4K', '$512', '$891'],
    },
  },
  {
    name: 'News',
    subtitle: 'RSS & Alerts',
    description:
      'Breaking news, beat writers, and custom feeds. Stay informed without switching tabs.',
    data: {
      type: 'ticker',
      labels: ['BREAKING', 'MARKETS', 'TECH', 'SPORTS'],
      values: [
        'Fed cuts rates',
        'S&P +1.2%',
        'AI summit today',
        'Trade deadline',
      ],
    },
  },
  {
    name: 'Custom',
    subtitle: 'Layouts & Style',
    description:
      'Make it yours. Shift cards, adjust transparency, and control speed. Your ticker, your rules.',
    data: {
      type: 'ticker',
      labels: ['LAYOUT', 'SPEED', 'POSITION', 'OPACITY'],
      values: ['Compact', 'Fast', 'Top', '100%'],
    },
  },
]

const accentGradients = [
  'from-rose-500 via-pink-500 to-fuchsia-500',
  'from-cyan-500 via-blue-500 to-indigo-500',
  'from-amber-500 via-orange-500 to-red-500',
  'from-emerald-500 via-teal-500 to-cyan-500',
]

const glowColors = [
  'bg-rose-500/8',
  'bg-blue-500/8',
  'bg-amber-500/8',
  'bg-emerald-500/8',
]

export default function ScrollHighlight() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // Transform scroll progress to fill the progress bar
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  // Update active index based on scroll position
  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (latest) => {
      const index = Math.min(
        Math.floor(latest * features.length),
        features.length - 1,
      )
      setActiveIndex(index)
    })
    return () => unsubscribe()
  }, [scrollYProgress])

  return (
    <div ref={containerRef} className="relative min-h-[300vh]">
      {/* Sticky Progress Bar */}
      <div className="sticky top-28 left-0 right-0 z-50 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-base-content/60 uppercase tracking-widest">
              Demo
            </span>
            <span className="text-xs font-mono text-base-content/40">
              {features[activeIndex]?.name}
            </span>
          </div>
          <div className="h-0.5 bg-base-300/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-rose-500 via-cyan-500 to-emerald-500 rounded-full"
              style={{ width: progressWidth }}
            />
          </div>
        </div>
      </div>

      {/* Feature Sections */}
      <div className="pt-12 pb-12">
        {features.map((feature, index) => (
          <FeatureSection
            key={feature.name}
            feature={feature}
            index={index}
          />
        ))}
      </div>
    </div>
  )
}

function FeatureSection({
  feature,
  index,
}: {
  feature: FeatureItem
  index: number
}) {
  const accentClass = accentGradients[index % accentGradients.length]
  const glowClass = glowColors[index % glowColors.length]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20% 0px -20% 0px' }}
      transition={{ duration: 0.6 }}
      className="min-h-[60vh] flex items-center justify-center py-12"
    >
      <div className="container max-w-6xl px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Data Visualization */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="relative order-2 lg:order-1"
          >
            {/* Ambient glow behind terminal */}
            <div className={`absolute -inset-6 ${glowClass} rounded-full blur-2xl`} />

            {/* Terminal-style frame */}
            <div className="relative bg-base-200/60 border border-base-300/30 rounded-sm overflow-hidden backdrop-blur-xl">
              {/* Terminal header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-base-300/20 bg-base-300/10">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-base-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-base-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-base-300" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs font-mono text-base-content/40 uppercase tracking-wider">
                    {feature.name.toLowerCase()}.feed
                  </span>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${accentClass} opacity-60`} />
              </div>

              {/* Data content */}
              <div className="p-5">
                {feature.data?.type === 'scores' && (
                  <div className="space-y-2">
                    {feature.data.labels.map((label, i) => (
                      <div
                        key={label}
                        className="flex items-center justify-between p-3 rounded bg-base-300/20 border border-base-300/20"
                      >
                        <span className="text-sm font-mono font-medium text-base-content/80">
                          {label}
                        </span>
                        <span className="text-sm font-mono text-base-content/50">
                          {feature.data?.values[i]}
                        </span>
                        <div className="w-16 h-0.5 rounded-full bg-base-300/50 overflow-hidden">
                          <motion.div
                            initial={{ width: '0%' }}
                            whileInView={{ width: `${60 + Math.random() * 30}%` }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className={`h-full bg-gradient-to-r ${accentClass} opacity-60 rounded-full`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {feature.data?.type === 'chart' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {feature.data.labels.map((label) => (
                        <span
                          key={label}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-base-300/30 text-base-content/50 uppercase"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-end justify-between h-28 gap-1.5">
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: '15%' }}
                          whileInView={{ height: `${30 + Math.random() * 60}%` }}
                          transition={{ duration: 0.4, delay: i * 0.08 }}
                          className={`flex-1 rounded-t-sm bg-gradient-to-t ${accentClass} opacity-50`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {feature.data?.type === 'ticker' && (
                  <div className="space-y-2">
                    {feature.data.labels.map((label, i) => (
                      <motion.div
                        key={label}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.08 }}
                        className="flex items-center gap-3 p-2.5 rounded bg-base-300/10"
                      >
                        <span className="text-[10px] font-mono text-base-content/40 uppercase tracking-wider">
                          {label}
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-base-300/30 to-transparent" />
                        <span className="text-xs font-mono text-base-content/60">
                          {feature.data?.values[i]}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="order-1 lg:order-2 text-center lg:text-left"
          >
            {/* Subtle accent line */}
            <div className={`h-0.5 w-12 rounded-full bg-gradient-to-r ${accentClass} mx-auto lg:mx-0 mb-5 opacity-60`} />

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 text-base-content/90">
              {feature.name}
            </h2>

            <p className="text-base text-base-content/50 max-w-sm leading-relaxed mx-auto lg:mx-0">
              {feature.description}
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
