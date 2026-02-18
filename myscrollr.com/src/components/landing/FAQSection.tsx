import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

const FAQ_ITEMS: Array<FAQItem> = [
  {
    question: 'Is Scrollr really free?',
    answer:
      'Yes — completely free and open source. No trials, no hidden fees, no premium gates on core features. The entire codebase is public on GitHub.',
  },
  {
    question: 'Does it slow down my browser?',
    answer:
      'No. Scrollr is lightweight by design. Data arrives via a single SSE connection — no polling, no background tabs, no CPU-heavy rendering. The ticker runs in a minimal Shadow DOM that stays out of your way.',
  },
  {
    question: 'Is my data private?',
    answer:
      'Absolutely. Scrollr has no analytics, no tracking pixels, no ads, and collects zero personal data. Your feed preferences stay in your browser. The code is open source so you can verify this yourself.',
  },
  {
    question: 'What browsers are supported?',
    answer:
      'Chrome, Brave, Edge, Firefox, and any Chromium-based browser. Available on the Chrome Web Store and Firefox Add-ons.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'No account required. Install the extension and start browsing with live data immediately. An optional account unlocks the dashboard for syncing preferences across devices.',
  },
]

const EASE = [0.22, 1, 0.36, 1] as const

export function FAQSection() {
  // Open the first item by default
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="relative">
      <div className="container relative py-24 lg:py-32">
        {/* Section Header — centered */}
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

        {/* Accordion */}
        <div className="max-w-3xl mx-auto space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <motion.div
              key={i}
              style={{ opacity: 0 }}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.08 + i * 0.06,
                duration: 0.5,
                ease: EASE,
              }}
            >
              <div
                className={`group relative bg-base-200/40 border rounded-xl overflow-hidden transition-colors duration-300 ${
                  openIndex === i
                    ? 'border-primary/20'
                    : 'border-base-300/30 hover:border-base-300/50'
                }`}
              >
                {/* Question (button) */}
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
                >
                  <span
                    className={`text-[15px] font-semibold transition-colors duration-200 ${
                      openIndex === i
                        ? 'text-base-content'
                        : 'text-base-content/60'
                    }`}
                  >
                    {item.question}
                  </span>
                  <motion.div
                    animate={{ rotate: openIndex === i ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200 ${
                      openIndex === i
                        ? 'bg-primary/10 text-primary'
                        : 'bg-base-300/20 text-base-content/25'
                    }`}
                  >
                    <ChevronDown size={15} />
                  </motion.div>
                </button>

                {/* Answer (collapsible) */}
                <AnimatePresence initial={false}>
                  {openIndex === i && (
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
                      <div className="px-6 pb-5 pt-0">
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
          ))}
        </div>
      </div>
    </section>
  )
}
