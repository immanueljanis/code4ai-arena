import { ScrollProgress } from '../fx'
import { SiteNav } from '../site/SiteNav'
import { SiteFooter } from '../site/SiteFooter'
import { useScrollFX } from './shared'
import { Hero } from './Hero'
import { SlopMarquee } from './SlopMarquee'
import { Problem } from './Problem'
import { HowItWorks } from './HowItWorks'
import { Proof } from './Proof'
import { ForAgents } from './ForAgents'
import { FinalCTA } from './FinalCTA'

export function Landing() {
  const scope = useScrollFX()
  return (
    <main ref={scope} className="relative">
      <ScrollProgress />
      <SiteNav newTab />
      <Hero />
      <SlopMarquee />
      <Problem />
      <HowItWorks />
      <Proof />
      <ForAgents />
      <FinalCTA />
      <SiteFooter />
    </main>
  )
}
