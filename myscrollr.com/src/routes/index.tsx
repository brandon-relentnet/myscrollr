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

// Code-splitting the home page.
//
// HeroSection and TickerShowcase stay eagerly imported because they are
// the LCP target (hero) and the first scroll-into-view section that
// holds the prerender-check assertion ("What actually sits..."). Every
// section below is split into its own lazy chunk so the initial JS
// bundle ships only what's needed for first paint and the immediate
// scroll. Lighthouse measured ~450ms of "unused JavaScript" savings on
// mobile from this; the rest of the win is shorter Element render
// delay because React has less to parse + hydrate before painting LCP.
//
// SSR safety: TanStack Start's build-time prerender resolves lazy
// imports synchronously, so the prerendered HTML body still contains
// every section's real content. The Suspense fallback below only
// shows at *runtime* hydration if the chunk hasn't downloaded yet —
// which on a warm cache or fast connection is rarely visible. Sized
// placeholders keep CLS at 0 either way.
//
// Placeholder heights were measured against the actual rendered
// content (mobile 390px and desktop 1280px) and averaged so neither
// viewport sees a meaningful layout jump. Slight under-estimates are
// preferred to over-estimates because they collapse cleanly when the
// real chunk renders.
const HowItWorks = lazy(() =>
  import('@/components/landing/HowItWorks').then((m) => ({
    default: m.HowItWorks,
  })),
)
const ChannelsShowcase = lazy(() =>
  import('@/components/landing/ChannelsShowcase').then((m) => ({
    default: m.ChannelsShowcase,
  })),
)
const CustomizationShowcase = lazy(() =>
  import('@/components/landing/CustomizationShowcase').then((m) => ({
    default: m.CustomizationShowcase,
  })),
)
const MakeItYoursSection = lazy(() =>
  import('@/components/landing/MakeItYoursSection').then((m) => ({
    default: m.MakeItYoursSection,
  })),
)
const BenefitsSection = lazy(() =>
  import('@/components/landing/BenefitsSection').then((m) => ({
    default: m.BenefitsSection,
  })),
)
const TrustSection = lazy(() =>
  import('@/components/landing/TrustSection').then((m) => ({
    default: m.TrustSection,
  })),
)
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

      <Suspense fallback={<SectionPlaceholder height="700px" />}>
        <HowItWorks />
      </Suspense>

      <Suspense fallback={<SectionPlaceholder height="1200px" />}>
        <ChannelsShowcase />
      </Suspense>

      <Suspense fallback={<SectionPlaceholder height="1600px" />}>
        <CustomizationShowcase />
      </Suspense>

      <Suspense fallback={<SectionPlaceholder height="1200px" />}>
        <MakeItYoursSection />
      </Suspense>

      <Suspense fallback={<SectionPlaceholder height="1300px" />}>
        <BenefitsSection />
      </Suspense>

      <Suspense fallback={<SectionPlaceholder height="2200px" />}>
        <TrustSection />
      </Suspense>

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
