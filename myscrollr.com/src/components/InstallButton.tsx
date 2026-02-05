import * as motion from 'motion/react-client'
import { Chrome, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'

type BrowserCTA = {
  label: string
  href: string
  icon: 'chrome' | 'globe'
  disabled: boolean
}

type InstallButtonProps = {
  className?: string
}

export default function InstallButton({ className = '' }: InstallButtonProps) {
  const chromeStoreUrl =
    'https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb'
  const [browserCTA, setBrowserCTA] = useState<BrowserCTA>({
    label: 'Add to Chrome',
    href: chromeStoreUrl,
    icon: 'chrome',
    disabled: false,
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
        disabled: false,
      })
    } else {
      setBrowserCTA({
        label: 'Not yet on Firefox',
        href: '#',
        icon: 'globe',
        disabled: true,
      })
    }
  }, [chromeStoreUrl])

  const handlePrimaryClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (browserCTA.disabled) {
      event.preventDefault()
    }
  }

  const baseClasses =
    'btn-pulse inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-sm uppercase tracking-wider'
  const disabledClasses = browserCTA.disabled
    ? 'cursor-not-allowed opacity-50 grayscale'
    : ''
  const composedClassName = [baseClasses, disabledClasses, className]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.a
      href={browserCTA.href}
      target={browserCTA.disabled ? undefined : '_blank'}
      rel={browserCTA.disabled ? undefined : 'noreferrer'}
      whileHover={browserCTA.disabled ? undefined : { scale: 1.02 }}
      whileTap={browserCTA.disabled ? undefined : { scale: 0.98 }}
      className={composedClassName}
      aria-disabled={browserCTA.disabled}
      onClick={handlePrimaryClick}
    >
      {browserCTA.icon === 'chrome' ? (
        <Chrome className="size-5" aria-hidden />
      ) : (
        <Globe className="size-5" aria-hidden />
      )}
      {browserCTA.label}
    </motion.a>
  )
}
