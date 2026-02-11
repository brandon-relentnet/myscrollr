import { createFileRoute } from '@tanstack/react-router'
import { usePageMeta } from '@/lib/usePageMeta'
import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { StreamsShowcase } from '@/components/landing/StreamsShowcase'
import { CommunitySection } from '@/components/landing/CommunitySection'
import { CallToAction } from '@/components/landing/CallToAction'

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

      <HowItWorks />

      <StreamsShowcase />

      <CommunitySection />

      <CallToAction />
    </main>
  )
}
