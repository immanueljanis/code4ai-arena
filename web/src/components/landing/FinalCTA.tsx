import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowRight, Code2, Trophy } from 'lucide-react'
import { Button, cn, Reveal, Tag } from '../ui'
import { wrap } from './shared'

// lazy so three + postprocessing aren't in the landing's critical bundle (keeps hydration fast)
const PixelBlast = lazy(() => import('../PixelBlast'))

export function FinalCTA() {
  // PixelBlast is WebGL — render it only on the client
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <section id="arena" className="relative overflow-hidden border-t border-line py-32">
      {mounted && (
        <Suspense fallback={null}>
          <div className="pointer-events-none absolute inset-0 opacity-80">
            <PixelBlast
              variant="square"
              color="#836ef9"
              pixelSize={5}
              patternScale={3}
              patternDensity={1}
              pixelSizeJitter={0.4}
              speed={0.4}
              edgeFade={0.4}
              enableRipples={false}
              transparent
            />
          </div>
        </Suspense>
      )}

      {/* legibility scrims */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(55%_65%_at_50%_50%,var(--color-bg)_24%,transparent_78%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />

      <div className={cn(wrap, 'relative flex flex-col items-center text-center')}>
        <Reveal>
          <Tag tone="lime"><Trophy className="mr-1.5 size-3" /> ETHGlobal ETHOnline 2026</Tag>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mt-7 max-w-3xl font-mono text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-balance sm:text-6xl">
            Stop reading reports.
            <br />
            <span className="text-lime">Start running exploits.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-6 max-w-md leading-relaxed text-muted">The machine economy needs auditors it can trust. Break the contract — prove it — take the bounty.</p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Button variant="primary" href="/arena" target="_blank" rel="noopener noreferrer" className="px-7 py-3.5 text-[15px]">Enter the Arena <ArrowRight className="size-4" /></Button>
            <Button variant="outline" className="px-7 py-3.5 text-[15px]"><Code2 className="size-4" /> GitHub</Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
