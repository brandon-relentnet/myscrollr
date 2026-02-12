import { motion } from 'motion/react'
import { Chrome } from 'lucide-react'
import { useEffect, useState } from 'react'

type BrowserCTA = {
  label: string
  href: string
  icon: 'chrome' | 'firefox'
}

type InstallButtonProps = {
  className?: string
}

function FirefoxIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4.27 11.02c-.22-2.07.37-3.61.37-3.61s.74 1.09 1.81 1.68c1.3.72 2.62.54 3.22.23a5.52 5.52 0 0 1 3.36-2.6c1.27-.33 2.7-.14 3.71.52.27-.53.42-1.15.42-1.15s1.42 1.33 1.62 3.3c.06.58.02 1.17-.14 1.83a5.99 5.99 0 0 1-.5 1.33 6.2 6.2 0 0 1-1.35 1.73 7.08 7.08 0 0 1-4.76 1.72 7.08 7.08 0 0 1-5.03-2.08A6.97 6.97 0 0 1 4.27 11z" />
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
    </svg>
  )
}

export default function InstallButton({ className = '' }: InstallButtonProps) {
  const chromeStoreUrl =
    'https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb'
  const firefoxAddonUrl =
    'https://addons.mozilla.org/en-US/firefox/addon/scrollr/'

  const [browserCTA, setBrowserCTA] = useState<BrowserCTA>({
    label: 'Add to Chrome',
    href: chromeStoreUrl,
    icon: 'chrome',
  })

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent.toLowerCase()
    const isChromium =
      ua.includes('chrome') ||
      ua.includes('crios') ||
      ua.includes('chromium') ||
      ua.includes('edg/')

    if (isChromium) {
      setBrowserCTA({
        label: 'Add to Chrome',
        href: chromeStoreUrl,
        icon: 'chrome',
      })
    } else {
      setBrowserCTA({
        label: 'Add to Firefox',
        href: firefoxAddonUrl,
        icon: 'firefox',
      })
    }
  }, [chromeStoreUrl, firefoxAddonUrl])

  const baseClasses =
    'btn-pulse inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-sm uppercase tracking-wider'
  const composedClassName = [baseClasses, className].filter(Boolean).join(' ')

  return (
    <motion.a
      href={browserCTA.href}
      target="_blank"
      rel="noreferrer"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={composedClassName}
    >
      {browserCTA.icon === 'chrome' ? (
        <Chrome className="size-5" aria-hidden />
      ) : (
        <FirefoxIcon />
      )}
      {browserCTA.label}
    </motion.a>
  )
}
