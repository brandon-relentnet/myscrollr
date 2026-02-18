import { createFileRoute } from '@tanstack/react-router'
import { usePageMeta } from '@/lib/usePageMeta'
import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { StreamsShowcase } from '@/components/landing/StreamsShowcase'
import { BenefitsSection } from '@/components/landing/BenefitsSection'
import { MidPageCTA } from '@/components/landing/MidPageCTA'
import { BuiltInTheOpen } from '@/components/landing/BuiltInTheOpen'
import { TrustSection } from '@/components/landing/TrustSection'
import { FAQSection } from '@/components/landing/FAQSection'
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
    <>
      <HeroSection />

      <BenefitsSection />

      <HowItWorks />

      <StreamsShowcase />

      <MidPageCTA />

      <BuiltInTheOpen />

      <TrustSection />

      <FAQSection />

      <CallToAction />
    </>
  )
}
