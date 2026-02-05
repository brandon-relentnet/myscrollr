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
    title: 'Scrollr — Never Alt-Tab Again',
    description:
      'Pin live sports scores, crypto prices, and custom feeds over any tab. The ticker that follows you everywhere.',
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
