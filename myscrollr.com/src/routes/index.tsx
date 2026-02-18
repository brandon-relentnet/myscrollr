import { createFileRoute } from '@tanstack/react-router'
import { usePageMeta } from '@/lib/usePageMeta'
import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { StreamsShowcase } from '@/components/landing/StreamsShowcase'
import { BenefitsSection } from '@/components/landing/BenefitsSection'
import { TrustSection } from '@/components/landing/TrustSection'
import { FAQSection } from '@/components/landing/FAQSection'
import { CallToAction } from '@/components/landing/CallToAction'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  usePageMeta({
    title: 'Scrollr — Live Data, Every Tab',
    description:
      'Pin live sports scores, crypto prices, news, and fantasy updates to every browser tab. Open source, private by design, and free.',
  })

  return (
    <>
      <HeroSection />

      <HowItWorks />

      <StreamsShowcase />

      <BenefitsSection />

      <TrustSection />

      <FAQSection />

      <CallToAction />
    </>
  )
}
