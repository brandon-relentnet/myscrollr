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

const accentColors = [
  'from-primary',
  'from-info',
  'from-secondary',
  'from-accent',
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
      {/* Sticky Progress Bar - more top padding to clear the header */}
      <div className="sticky top-28 left-0 right-0 z-50 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-primary uppercase tracking-widest">
              Live Demo
            </span>
            <span className="text-xs font-mono text-base-content/50">
              {features[activeIndex]?.name} • {activeIndex + 1}/
              {features.length}
            </span>
          </div>
          <div className="h-1 bg-base-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-info rounded-full"
              style={{ width: progressWidth }}
            />
          </div>
        </div>
      </div>

      {/* Feature Sections */}
      <div className="pt-16 pb-16">
        {features.map((feature, index) => (
          <FeatureSection
            key={feature.name}
            feature={feature}
            index={index}
            isActive={activeIndex === index}
          />
        ))}
      </div>
    </div>
  )
}

function FeatureSection({
  feature,
  index,
  isActive,
}: {
  feature: FeatureItem
  index: number
  isActive: boolean
}) {
  const accentClass = accentColors[index % accentColors.length]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: isActive ? 1 : 0.3 }}
      viewport={{ margin: '-30% 0px -30% 0px' }}
      transition={{ duration: 0.5 }}
      className="min-h-[70vh] flex items-center justify-center py-12"
    >
      <div className="container max-w-6xl px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Data Visualization */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="relative order-2 lg:order-1"
          >
            {/* Terminal-style frame */}
            <div className="relative bg-base-200/80 border border-base-300 rounded-xl overflow-hidden backdrop-blur-sm">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-base-300 bg-base-300/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-secondary/50" />
                  <div className="w-3 h-3 rounded-full bg-warning/50" />
                  <div className="w-3 h-3 rounded-full bg-success/50" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs font-mono text-base-content/50 uppercase">
                    {feature.name}_feed.exe
                  </span>
                </div>
              </div>

              {/* Data content */}
              <div className="p-6">
                {feature.data?.type === 'scores' && (
                  <div className="space-y-4">
                    {feature.data.labels.map((label, i) => (
                      <div
                        key={label}
                        className="flex items-center justify-between p-3 rounded-lg bg-base-300/50 border border-base-300"
                      >
                        <span className="text-sm font-mono font-bold text-base-content">
                          {label}
                        </span>
                        <span className="text-sm font-mono text-base-content/70">
                          {feature.data?.values[i]}
                        </span>
                        <div className="w-16 h-1 rounded-full bg-base-300 overflow-hidden">
                          <motion.div
                            initial={{ width: '0%' }}
                            whileInView={{
                              width: `${60 + Math.random() * 40}%`,
                            }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className={`h-full bg-gradient-to-r ${accentClass}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {feature.data?.type === 'chart' && (
                  <div className="space-y-3">
                    <div className="flex gap-2 mb-4">
                      {feature.data.labels.map((label) => (
                        <span
                          key={label}
                          className="text-xs font-mono px-2 py-1 rounded bg-base-300/50"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-end justify-between h-32 gap-2">
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: '20%' }}
                          whileInView={{
                            height: `${30 + Math.random() * 70}%`,
                          }}
                          transition={{ duration: 0.5, delay: i * 0.1 }}
                          className={`flex-1 rounded-t bg-gradient-to-t ${accentClass} opacity-70`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {feature.data?.type === 'ticker' && (
                  <div className="space-y-3">
                    {feature.data.labels.map((label, i) => (
                      <motion.div
                        key={label}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.1 }}
                        className="flex items-center gap-3 p-2 rounded bg-base-300/30"
                      >
                        <span className="text-xs font-mono text-primary uppercase">
                          {label}
                        </span>
                        <span className="h-px flex-1 bg-base-300" />
                        <span className="text-xs font-mono text-base-content/70">
                          {feature.data?.values[i]}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Decorative corner accent */}
            <div
              className={`absolute -bottom-2 -right-2 w-16 h-16 bg-gradient-to-br ${accentClass} opacity-20 rounded-bl-xl`}
            />
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="order-1 lg:order-2 text-center lg:text-left"
          >
            {/* Accent pill */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`inline-block mb-4 px-4 py-1.5 rounded-full bg-gradient-to-r ${accentClass} bg-opacity-10 border border-opacity-20 border-current`}
            >
              <span className="text-xs font-mono uppercase tracking-wider text-base-content">
                {feature.subtitle}
              </span>
            </motion.div>

            {/* Large title */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
            >
              <span className="text-base-content">{feature.name}</span>
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-base-content/60 max-w-md leading-relaxed"
            >
              {feature.description}
            </motion.p>

            {/* Live indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 mt-6 justify-center lg:justify-start"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-xs font-mono text-primary uppercase tracking-widest">
                Live Data
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
