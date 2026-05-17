import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import {
  HOMEPAGE_FAQ_ITEMS,
  faqPage,
  organization,
  softwareApplication,
  website,
} from '@/lib/structured-data'
import { HeroSection } from '@/components/landing/HeroSection'
import { TickerShowcase } from '@/components/landing/TickerShowcase'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { ChannelsShowcase } from '@/components/landing/ChannelsShowcase'
import { CustomizationShowcase } from '@/components/landing/CustomizationShowcase'
import { MakeItYoursSection } from '@/components/landing/MakeItYoursSection'
import { BenefitsSection } from '@/components/landing/BenefitsSection'
import { TrustSection } from '@/components/landing/TrustSection'

// FAQSection and CallToAction are below-the-fold and animation-heavy
// (FAQ has 8 simultaneous spring/blur pipelines; CallToAction has the
// mouse-parallax orb + 12 particles + 3 pulse rings + animated counters).
// Splitting them into separate chunks keeps the initial JS bundle lean
// for first paint, and defers their parse cost until the user is
// scrolling toward them.
//
// Sized Suspense fallbacks below match each section's typical rendered
// height to prevent any layout shift on chunk arrival.
const FAQSection = lazy(() =>
  import('@/components/landing/FAQSection').then((m) => ({
    default: m.FAQSection,
  })),
)
const CallToAction = lazy(() =>
  import('@/components/landing/CallToAction').then((m) => ({
    default: m.CallToAction,
  })),
)

// Hero LCP preload. The browser otherwise can't discover the image URL
// from the initial HTML — `HeroProductShowcase` only renders its
// `<picture>` after React mounts, which Lighthouse measured as ~700ms
// of "Element render delay" on mobile. Preloading from the head lets
// the image fetch run in parallel with the JS bundle.
//
// Theme handling: the SSR pass renders the dark variant (because
// `useTheme()` defaults to 'dark' on the server), but the theme inline
// script in __root.tsx can flip the document to light before React
// hydrates. We avoid wasting a preload on the wrong variant by
// scoping each preload with a `media` query keyed on the OS color
// scheme. Users with a stored theme that contradicts their OS will
// get a wasted ~30KB preload — an acceptable trade since they're a
// small minority and the "correct" image still loads through React.
//
// The srcset and sizes attributes mirror `ProductScreenshot` exactly
// so the browser picks the same rendition the React component would
// have requested. Keeping these in sync is important: a mismatch
// means the preloaded file is unused and a second fetch happens.
const HERO_PRELOAD_SIZES =
  '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px'
const heroPreloadSrcSet = (theme: 'dark' | 'light') =>
  [
    `/screenshots/channels/sports-${theme}@sm.webp 800w`,
    `/screenshots/channels/sports-${theme}@md.webp 1200w`,
    `/screenshots/channels/sports-${theme}@1x.webp 1600w`,
    `/screenshots/channels/sports-${theme}@2x.webp 3200w`,
  ].join(', ')

export const Route = createFileRoute('/')({
  component: HomePage,
  head: () =>
    seo({
      title: 'Scrollr: Live Data Ticker for Desktop',
      description:
        'A quiet desktop ticker for live sports, markets, news, and fantasy data. Free and open source. macOS, Windows, Linux.',
      path: '/',
      image: 'https://myscrollr.com/og/home.png',
      imageAlt: 'Scrollr desktop ticker showing live market and sports data.',
      jsonLd: [
        organization,
        website,
        softwareApplication,
        faqPage(HOMEPAGE_FAQ_ITEMS),
      ],
      extraLinks: [
        {
          rel: 'preload',
          as: 'image',
          imagesrcset: heroPreloadSrcSet('dark'),
          imagesizes: HERO_PRELOAD_SIZES,
          fetchpriority: 'high',
          media: '(prefers-color-scheme: dark)',
        },
        {
          rel: 'preload',
          as: 'image',
          imagesrcset: heroPreloadSrcSet('light'),
          imagesizes: HERO_PRELOAD_SIZES,
          fetchpriority: 'high',
          media: '(prefers-color-scheme: light)',
        },
      ],
    }),
})

function HomePage() {
  return (
    <>
      <HeroSection />

      <TickerShowcase />

      <HowItWorks />

      <ChannelsShowcase />

      <CustomizationShowcase />

      <MakeItYoursSection />

      <BenefitsSection />

      <TrustSection />

      <Suspense fallback={<SectionPlaceholder height="900px" />}>
        <FAQSection />
      </Suspense>

      <Suspense fallback={<SectionPlaceholder height="700px" />}>
        <CallToAction />
      </Suspense>
    </>
  )
}

/**
 * Sized placeholder for `<Suspense>` fallback. Reserves vertical space
 * so the page does not jump when the lazy chunk finishes loading. Heights
 * approximate the average rendered size of each section on desktop;
 * mobile breakpoints land slightly off but the visual jump is small
 * since the deferred sections sit below the viewport on mobile too.
 */
function SectionPlaceholder({ height }: { height: string }) {
  return (
    <div
      aria-hidden="true"
      style={{ minHeight: height }}
      className="bg-base-100"
    />
  )
}
