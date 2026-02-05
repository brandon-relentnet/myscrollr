import * as motion from 'motion/react-client'

const platforms = [
  { name: 'YouTube', color: '#FF0000', icon: 'play' },
  { name: 'Twitch', color: '#9146FF', icon: 'tv' },
  { name: 'Yahoo Finance', color: '#1DB954', icon: 'chart' },
  { name: 'ESPN', color: '#CC0000', icon: 'score' },
  { name: 'Sheets', color: '#0F9D58', icon: 'grid' },
]

export function PlatformBar() {
  return (
    <section className="py-12 border-y border-base-300 bg-base-200/50">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <span className="inline-block px-3 py-1 rounded bg-base-300 border border-base-300 text-[10px] font-bold font-mono text-base-content/50 uppercase tracking-widest">
            Universal Compatibility
          </span>
          <h3 className="text-xl sm:text-2xl font-black mt-4 text-base-content/80 uppercase tracking-tight">
            Works where you <span className="text-primary">work and play</span>
          </h3>
        </motion.div>

        {/* Platform Grid */}
        <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-8">
          {platforms.map((platform, index) => (
            <motion.div
              key={platform.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="group flex items-center gap-3 px-5 py-3 rounded-lg bg-base-200 border border-base-300 hover:border-primary/30 transition-all duration-300 shadow-sm"
            >
              {/* Icon */}
              <div
                className="w-8 h-8 rounded flex items-center justify-center shadow-inner"
                style={{
                  backgroundColor: `${platform.color}20`,
                  color: platform.color,
                }}
              >
                {platform.icon === 'play' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
                {platform.icon === 'tv' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="20" height="15" x="2" y="5" rx="2" />
                    <polyline points="17 2 12 7 7 2" />
                  </svg>
                )}
                {platform.icon === 'chart' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 3v18h18" />
                    <path d="m19 9-5 5-4-4-3 3" />
                  </svg>
                )}
                {platform.icon === 'score' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                    <path d="M2 12h20" />
                  </svg>
                )}
                {platform.icon === 'grid' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                )}
              </div>

              {/* Name */}
              <span className="text-[10px] font-black uppercase tracking-widest text-base-content/50 group-hover:text-primary transition-colors">
                {platform.name}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Live Data Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex justify-center items-center gap-2 text-[10px] font-bold font-mono text-base-content/30 uppercase tracking-[0.2em]"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-50" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
          </span>
          Compatible with any website
        </motion.div>
      </div>
    </section>
  )
}
