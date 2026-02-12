import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, HelpCircle } from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Is Scrollr really free?',
    answer:
      'Yes — completely free and open source under the AGPL-3.0 license. No trials, no hidden fees, no premium gates on core features. The entire codebase is public on GitHub.',
  },
  {
    question: 'Does it slow down my browser?',
    answer:
      'No. Scrollr is lightweight by design. Data arrives via a single SSE connection — no polling, no background tabs, no CPU-heavy rendering. The ticker overlay runs in a minimal Shadow DOM that stays out of your way.',
  },
  {
    question: 'Is my data private?',
    answer:
      'Absolutely. Scrollr has no analytics, no tracking pixels, no ads, and collects zero personal data. Your feed preferences stay in your browser. The code is open source so you can verify this yourself.',
  },
  {
    question: 'What browsers are supported?',
    answer:
      'Chrome, Brave, Edge, and any Chromium-based browser. Firefox support is planned. The extension is available on the Chrome Web Store today.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'No account required. Install the extension and start browsing with live data immediately. An optional account unlocks the dashboard for syncing preferences across devices and managing your streams.',
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="container py-24 lg:py-32 relative">
      <div className="relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14 flex flex-col items-center"
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/8 text-primary text-[10px] font-bold rounded-sm border border-primary/15 uppercase tracking-[0.2em]">
              <HelpCircle size={12} />
              FAQ
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight uppercase leading-[0.95] mb-5">
            Common{' '}
            <span className="text-gradient-primary">Questions</span>
          </h2>
          <p className="text-sm text-base-content/40 max-w-xl mx-auto leading-relaxed">
            Everything you need to know before installing. Still have questions?
            Ask in{' '}
            <a
              href="https://discord.gg/85b49TcGJa"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
            >
              Discord
            </a>
            .
          </p>
        </motion.div>

        {/* Accordion */}
        <div className="max-w-3xl mx-auto space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.1 + i * 0.06,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div
                className={`group relative bg-base-200/50 border rounded-sm overflow-hidden transition-colors ${
                  openIndex === i
                    ? 'border-primary/20'
                    : 'border-base-300/50 hover:border-primary/10'
                }`}
              >
                {/* Top accent line */}
                <div
                  className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent to-transparent transition-all duration-500 ${
                    openIndex === i
                      ? 'via-primary/20'
                      : 'via-primary/0 group-hover:via-primary/10'
                  }`}
                />

                {/* Question (button) */}
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
                >
                  <span
                    className={`text-sm font-bold uppercase tracking-wider transition-colors ${
                      openIndex === i
                        ? 'text-primary'
                        : 'text-base-content/70'
                    }`}
                  >
                    {item.question}
                  </span>
                  <motion.div
                    animate={{ rotate: openIndex === i ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className={`shrink-0 h-8 w-8 rounded-sm flex items-center justify-center transition-colors ${
                      openIndex === i
                        ? 'bg-primary/10 text-primary'
                        : 'bg-base-300/30 text-base-content/30'
                    }`}
                  >
                    <ChevronDown size={16} />
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
                        height: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                        opacity: { duration: 0.2, delay: 0.05 },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 pt-0">
                        <div className="h-px bg-base-300/30 mb-4" />
                        <p className="text-sm text-base-content/40 leading-relaxed">
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

        {/* Subtle bottom text */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4 mt-8"
        >
          <span className="h-px w-8 bg-base-300/30" />
          <span className="text-[10px] font-mono text-base-content/20 uppercase tracking-wider">
            More questions? We're in Discord
          </span>
          <span className="h-px w-8 bg-base-300/30" />
        </motion.div>
      </div>
    </section>
  )
}
