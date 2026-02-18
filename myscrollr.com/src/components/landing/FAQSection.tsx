import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronDown,
  Code,
  Gift,
  Globe,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  UserX,
  Zap,
} from 'lucide-react'

// ── Types & Data ─────────────────────────────────────────────────

interface FAQItem {
  icon: typeof ShieldCheck
  question: string
  answer: string
}

const FAQ_ITEMS: Array<FAQItem> = [
  {
    icon: Gift,
    question: 'Is Scrollr really free?',
    answer:
      'Completely free, no strings attached. There are no trials, no premium gates on core features, and no ads. The entire codebase is open source under the AGPL-3.0 license — you can inspect every line.',
  },
  {
    icon: Zap,
    question: 'Does it slow down my browser?',
    answer:
      'Not noticeably. All data flows through a single connection in the background — not one per tab. The feed bar runs in an isolated Shadow DOM with at most 50 items in memory, and nothing gets written to disk.',
  },
  {
    icon: ShieldCheck,
    question: 'Is my browsing data private?',
    answer:
      "Yes. The extension contains zero analytics, zero tracking pixels, and zero telemetry. Your preferences are stored in your browser's local extension storage and never transmitted anywhere. The only network requests go to the Scrollr API to fetch your feed data.",
  },
  {
    icon: Globe,
    question: 'What browsers are supported?',
    answer:
      'Chrome, Firefox, Edge, Safari, Brave, and any Chromium-based browser. Scrollr is available on the Chrome Web Store and Firefox Add-ons.',
  },
  {
    icon: UserX,
    question: 'Do I need an account?',
    answer:
      'No. Install the extension and you\u2019ll immediately receive live stock and sports data with no sign-up. Creating a free account unlocks all four integrations (finance, sports, news, and fantasy), the web dashboard, and cross-device preference sync.',
  },
  {
    icon: Layers,
    question: 'What data does Scrollr show?',
    answer:
      'Four integrations: real-time stock and crypto prices, live sports scores across major leagues, RSS news headlines from hundreds of sources, and Yahoo Fantasy league updates including standings and matchups.',
  },
  {
    icon: SlidersHorizontal,
    question: 'Can I customize the feed?',
    answer:
      'Extensively. Position the bar at the top or bottom of your screen, drag to resize the height, switch between comfort and compact modes, choose overlay or push behavior, pick which integrations appear as tabs, and choose which websites show or hide the feed.',
  },
  {
    icon: Code,
    question: 'Is Scrollr open source?',
    answer:
      'Yes, under the GNU Affero General Public License v3.0. Every component — the browser extension, the web app, the API, and all integration services — is publicly available on GitHub. You can inspect, fork, or contribute to any part of it.',
  },
]

// ── Constants ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

// ── Desktop Answer Panel ─────────────────────────────────────────

function AnswerPanel({ item }: { item: FAQItem }) {
  const WatermarkIcon = item.icon

  return (
    <div className="relative h-full rounded-2xl bg-base-200/40 border border-base-300/25 p-8 sm:p-9 overflow-hidden">
      {/* Top accent line */}
      <div
        className="absolute top-0 left-8 right-8 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent)',
          opacity: 0.2,
        }}
      />

      {/* Watermark icon */}
      <WatermarkIcon
        size={150}
        strokeWidth={0.4}
        className="absolute -bottom-8 -right-8 text-primary/[0.03] pointer-events-none select-none"
      />

      <h3 className="relative text-lg sm:text-xl font-bold text-base-content mb-4 leading-snug">
        {item.question}
      </h3>
      <p className="relative text-[15px] text-base-content/50 leading-relaxed">
        {item.answer}
      </p>
    </div>
  )
}

// ── Mobile Accordion Item ────────────────────────────────────────

function AccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FAQItem
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  const Icon = item.icon

  return (
    <motion.div
      style={{ opacity: 0 }}
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        delay: 0.06 + index * 0.05,
        duration: 0.5,
        ease: EASE,
      }}
    >
      <div
        className={`group relative bg-base-200/40 border rounded-xl overflow-hidden transition-[color,background-color,border-color,box-shadow] duration-300 ${
          isOpen
            ? 'border-primary/20'
            : 'border-base-300/30 hover:border-base-300/50'
        }`}
      >
        {/* Question trigger */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
        >
          <span className="flex items-center gap-3 min-w-0">
            <Icon
              size={16}
              className={`shrink-0 transition-colors duration-200 ${
                isOpen ? 'text-primary' : 'text-base-content/25'
              }`}
            />
            <span
              className={`text-[15px] font-semibold transition-colors duration-200 leading-snug ${
                isOpen ? 'text-base-content' : 'text-base-content/60'
              }`}
            >
              {item.question}
            </span>
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200 ${
              isOpen
                ? 'bg-primary/10 text-primary'
                : 'bg-base-300/20 text-base-content/25'
            }`}
          >
            <ChevronDown size={15} />
          </motion.div>
        </button>

        {/* Collapsible answer */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.3, ease: EASE },
                opacity: { duration: 0.2, delay: 0.05 },
              }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-0">
                <div className="h-px bg-base-300/20 mb-4" />
                <p className="text-sm text-base-content/50 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export function FAQSection() {
  const [activeIndex, setActiveIndex] = useState(0)

  // Mobile accordion can close all items; desktop always has one selected
  const handleMobileToggle = (i: number) =>
    setActiveIndex(activeIndex === i ? -1 : i)

  return (
    <section className="relative">
      <div className="container relative py-24 lg:py-32">
        {/* ── Section header ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center text-center mb-12 lg:mb-14"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95] mb-4 text-center">
            Common <span className="text-gradient-primary">Questions</span>
          </h2>
          <p className="text-base text-base-content/50 leading-relaxed text-center max-w-lg">
            Everything you need to know before installing.
          </p>
        </motion.div>

        {/* ── Desktop: Split panel ── */}
        <motion.div
          style={{ opacity: 0 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="hidden lg:flex gap-6 max-w-5xl mx-auto items-start"
        >
          {/* Left — question nav */}
          <div className="w-[360px] shrink-0 space-y-1">
            {FAQ_ITEMS.map((item, i) => {
              const Icon = item.icon
              const isActive = activeIndex === i
              return (
                <button
                  key={item.question}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`relative w-full text-left pl-5 pr-4 py-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-300 ${
                    isActive
                      ? 'bg-base-200/60 text-base-content'
                      : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-200/25'
                  }`}
                >
                  {/* Sliding accent indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="faq-indicator"
                      className="absolute left-0 top-2.5 bottom-2.5 w-[3px] bg-primary rounded-full"
                      transition={{
                        type: 'spring',
                        bounce: 0.15,
                        duration: 0.4,
                      }}
                    />
                  )}

                  <Icon
                    size={16}
                    className={`shrink-0 transition-colors duration-300 ${
                      isActive ? 'text-primary' : ''
                    }`}
                  />
                  <span className="text-[15px] font-semibold leading-snug">
                    {item.question}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Right — answer panel */}
          <div className="flex-1 min-h-[260px]">
            <AnimatePresence mode="wait">
              {activeIndex >= 0 && (
                <motion.div
                  key={activeIndex}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <AnswerPanel item={FAQ_ITEMS[activeIndex]} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Mobile / Tablet: Accordion ── */}
        <div className="lg:hidden max-w-3xl mx-auto space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={item.question}
              item={item}
              index={i}
              isOpen={activeIndex === i}
              onToggle={() => handleMobileToggle(i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
