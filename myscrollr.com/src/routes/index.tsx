import { createFileRoute } from '@tanstack/react-router'
import ScrollHighlight from '@/components/ScrollHighlight'
import { usePageMeta } from '@/lib/usePageMeta'
import { HeroSection } from '@/components/landing/HeroSection'
import { FeaturesGrid } from '@/components/landing/FeaturesGrid'
import { CallToAction } from '@/components/landing/CallToAction'
import { AboutPreview } from '@/components/landing/AboutPreview'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  usePageMeta({
    title: 'Custom Chrome Ticker Overlay | Scrollr',
    description:
      'Scrollr is a Chrome extension that pins a locked bar or moving ticker on top of any tab so sports, fantasy, market, or RSS data stays visible in real time.',
  })

  return (
    <main>
      <HeroSection />

      <div className="container">
        <FeaturesGrid />
      </div>

      <section className="scroll-m-75" id="scroll-highlight">
        <ScrollHighlight />
      </section>

      <AboutPreview />

      <CallToAction />
    </main>
  )
}
