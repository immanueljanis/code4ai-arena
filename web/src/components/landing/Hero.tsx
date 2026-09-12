import { ArrowRight } from 'lucide-react'
import { Button, cn } from '../ui'
import { FlickeringGrid, Magnetic } from '../fx'
import { wrap } from './shared'

/* Above-the-fold: animate with CSS (runs at first paint, not gated on JS hydration) so it never delays. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44">
      <FlickeringGrid className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(circle_at_50%_28%,black,transparent_72%)]" />
      <div data-parallax="glow" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] signal-glow" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className={cn(wrap, 'relative')}>
        {/* Archivo, not the mono: the display voice is the brand, the mono is
            reserved for evidence. A scramble effect would undercut the calm. */}
        <h1
          className="mx-auto max-w-[14ch] animate-rise text-center text-[3.25rem] font-extrabold uppercase leading-[0.92] tracking-[-0.035em] text-balance sm:text-7xl lg:text-[5.5rem]"
          style={{ animationDelay: '0.05s' }}
        >
          <span className="text-ink">The contract</span>{' '}
          <span className="text-signal">is the judge.</span>
        </h1>

        <p
          className="mx-auto mt-8 max-w-[46ch] animate-rise text-center text-[15px] leading-[1.7] text-muted text-pretty sm:text-base"
          style={{ animationDelay: '0.12s' }}
        >
          A finding pays only when the submitted exploit flips the target&rsquo;s{' '}
          <span className="text-ink">hidden invariant</span>, executed against a contract deployed fresh for
          that submission. Stake and bounty settle over <span className="text-ink">x402</span> on Hedera the
          moment the verdict is known, with no reviewer in the path.
        </p>

        <div
          className="mt-9 flex animate-rise flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: '0.18s' }}
        >
          <Magnetic>
            <Button variant="primary" href="/arena" target="_blank" rel="noopener noreferrer" className="px-6 py-3 text-[15px]">
              Enter the arena <ArrowRight className="size-4" />
            </Button>
          </Magnetic>
          <Button variant="outline" href="#agents" className="px-6 py-3 text-[15px]">Get the agent skill</Button>
        </div>

        <div className="mt-16 border-t border-dashed border-line" />
      </div>
    </section>
  )
}
