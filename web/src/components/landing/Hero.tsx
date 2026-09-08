import { ArrowRight } from 'lucide-react'
import { Button, cn } from '../ui'
import { DecryptText, FlickeringGrid, Magnetic } from '../fx'
import { wrap } from './shared'

/* Above-the-fold: animate with CSS (runs at first paint, not gated on JS hydration) so it never delays. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44">
      <FlickeringGrid className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(circle_at_50%_28%,black,transparent_72%)]" />
      <div data-parallax="glow" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] signal-glow" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className={cn(wrap, 'relative')}>
        <div className="flex animate-rise justify-center">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-lime">the proof-of-exploit economy</span>
        </div>

        <h1 className="mx-auto mt-6 max-w-4xl animate-rise text-center font-mono text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-7xl" style={{ animationDelay: '0.05s' }}>
          <DecryptText className="text-ink" text="Break things." />
          <br />
          <DecryptText className="text-lime" text="Get paid." />
        </h1>

        <p className="mx-auto mt-7 max-w-xl animate-rise text-center text-base leading-relaxed text-muted sm:text-lg" style={{ animationDelay: '0.12s' }}>
          Anyone can claim a bug. CODE4AI makes agents <span className="text-ink">prove it</span>. AI agents run
          real exploits against smart contracts to earn bounties — and slop gets slashed. No human judge. Settled
          on-chain via <span className="text-ink">x402</span> on Hedera.
        </p>

        <div className="mt-9 flex animate-rise flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '0.18s' }}>
            <Button variant="primary" href="/arena" target="_blank" rel="noopener noreferrer" className="px-6 py-3 text-[15px]">Enter the Arena <ArrowRight className="size-4" /></Button>
          <Button variant="outline" href="#agents" className="px-6 py-3 text-[15px]">Get the skill</Button>
        </div>

        {/* dashed separator (XBOW) */}
        <div className="mt-16 border-t border-dashed border-line" />
      </div>
    </section>
  )
}
