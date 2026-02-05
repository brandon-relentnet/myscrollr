import * as motion from 'motion/react-client'
import TypewriterChangeContentExample from '@/components/Typewriter'
import ScrollrSVG from '@/components/ScrollrSVG'
import InstallButton from '@/components/InstallButton'

export function HeroSection() {
  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <>
      {/* Hero Section - Bold Terminal Aesthetic */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
        <div className="container relative z-10">
          <div className="flex lg:flex-row flex-col justify-center items-center gap-12 lg:gap-20">
            {/* Abstract Pulse Visualization */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="relative order-2 lg:order-1"
            >
              {/* Decorative glow */}
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />

              {/* Large animated pulse */}
              <motion.div
                animate={{
                  scale: [1, 1.02, 1],
                  rotate: [0, 0.5, 0, -0.5, 0],
                }}
                transition={{ duration: 6, repeat: Infinity }}
                className="relative"
              >
                <ScrollrSVG
                  width={400}
                  height={400}
                  className="w-64 h-64 lg:w-96 lg:h-96"
                />
              </motion.div>

              {/* Floating data indicators */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                whileHover={{ scale: 1.05, rotate: 2 }}
                className="absolute top-8 -right-4 px-4 py-2 rounded border border-primary/40 bg-base-200/90 backdrop-blur-sm shadow-lg"
              >
                <span className="flex items-center gap-2 text-primary">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <span className="text-xs font-bold font-mono tracking-widest">
                    LIVE
                  </span>
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.7 }}
                whileHover={{ scale: 1.05, rotate: -2 }}
                className="absolute bottom-20 -left-2 px-4 py-2 rounded border border-info/40 bg-base-200/90 backdrop-blur-sm shadow-lg"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-info">
                    +2.4%
                  </span>
                  <span className="text-xs font-mono text-base-content/50">
                    BTC
                  </span>
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                whileHover={{ scale: 1.05, rotate: 2 }}
                className="absolute bottom-4 right-8 px-4 py-2 rounded border border-secondary/40 bg-base-200/90 backdrop-blur-sm shadow-lg"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-secondary">
                    Q4 2:34
                  </span>
                  <span className="text-xs font-mono text-base-content/50">
                    LAL
                  </span>
                </span>
              </motion.div>
            </motion.div>

            {/* Hero Text */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
              className="w-fit min-w-140 order-1 lg:order-2"
            >
              <TypewriterChangeContentExample />

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1 }}
                className="mt-6 text-lg sm:text-xl text-base-content/60 max-w-md leading-relaxed"
              >
                Pin live sports scores, crypto prices, and custom feeds over any
                tab.
                <span className="text-primary font-medium">
                  {' '}
                  Stop alt-tabting.
                </span>
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.2 }}
                className="flex flex-wrap gap-4 mt-8"
              >
                <InstallButton />
                <motion.button
                  type="button"
                  whileHover={{ y: 2 }}
                  whileTap={{ y: 0 }}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded border border-base-300 bg-base-200 px-6 py-3 text-sm font-bold uppercase tracking-wider text-base-content hover:bg-base-300 transition-all shadow-sm"
                  onClick={() => scrollToSection('welcome')}
                >
                  Learn More
                </motion.button>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-base-content/40"
        >
          <span className="text-xs font-mono uppercase tracking-wider">
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-5 h-8 rounded-full border-2 border-current flex justify-center pt-2"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1 h-1 rounded-full bg-current"
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Welcome Section */}
      <section className="container scroll-m-75" id="welcome">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex lg:flex-row flex-col-reverse justify-center items-center gap-12 text-center lg:text-left"
        >
          <div>
            <h1 className="font-extrabold text-4xl sm:text-5xl text-balance tracking-tight">
              Welcome to <span className="gradient-text-pulse">Scrollr</span>
            </h1>

            <p className="mt-4 text-lg max-w-prose text-base-content/70">
              Tickers dominate our screens but haven't evolved in years. It's
              almost as if Tickers are talking at you and not with you.
            </p>
            <p className="mt-4 max-w-prose text-2xl italic font-semibold text-base-content/80">
              Scrollr brings them to life.
            </p>
            <p className="mt-4 max-w-prose text-lg text-base-content/70">
              An interactive, personalized, modern ticker experience built to
              engage effortlessly. Follow your Fantasy teams + more while you
              stream the game or just browsing the web.{' '}
              <span className="font-semibold text-primary">
                Available as a Chrome Extension.
              </span>
            </p>

            <div className="flex flex-wrap gap-3 mt-6 justify-center lg:justify-start items-center">
              <motion.button
                type="button"
                whileHover={{ y: 2 }}
                whileTap={{ y: 0 }}
                className="btn-pulse rounded text-sm shadow-lg"
                onClick={() => scrollToSection('scroll-highlight')}
              >
                Explore Features
              </motion.button>
              <a
                href="https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex h-full items-center text-sm font-bold uppercase tracking-wider text-base-content/60 hover:text-primary transition-colors px-2"
              >
                View on Web Store
              </a>
            </div>
          </div>

          <ScrollrSVG className="w-full max-w-sm h-auto" />
        </motion.div>
      </section>
    </>
  )
}
