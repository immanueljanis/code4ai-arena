import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, XCircle } from 'lucide-react'
import { Card, Reveal, SectionLabel, cn } from '../ui'
import { wrap } from './shared'
import { INCIDENTS } from './content'

const pad = (n: number) => String(n).padStart(2, '0')

export function Problem() {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)

  // GSAP lateral-pin indicator: scrubbed rail fill + active-step tracking
  useEffect(() => {
    let ctx: { revert: () => void } | undefined
    void (async () => {
      const { gsap } = await import('gsap')
      const { ScrollTrigger } = await import('gsap/ScrollTrigger')
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        const root = ref.current
        if (!root) return
        const fill = root.querySelector<HTMLElement>('.break-fill')
        const list = root.querySelector<HTMLElement>('.break-list')
        if (fill && list) {
          gsap.fromTo(fill, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: list, start: 'top 70%', end: 'bottom 75%', scrub: 0.4 } })
        }
        root.querySelectorAll<HTMLElement>('.break-card').forEach((el, i) => {
          ScrollTrigger.create({
            trigger: el,
            start: 'top 60%',
            end: 'bottom 60%',
            onToggle: (self) => self.isActive && setActive(i),
          })
        })
      }, ref)
    })()
    return () => ctx?.revert()
  }, [])

  return (
    <section id="problem" ref={ref} className="relative py-28">
      <div className={wrap}>
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* pinned heading + step indicator */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionLabel>the break</SectionLabel>
            <Reveal>
              <h2 className="mt-5 font-mono text-3xl font-bold uppercase leading-[1.05] tracking-tight text-balance sm:text-4xl">
                AI made auditing free, and broke the platforms that pay for it.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-md leading-relaxed text-muted">
                Anyone can point an LLM at a contract and mass-produce plausible, fabricated reports. Incumbents
                trust a <span className="text-ink">human</span> to read each one, a model that does not scale
                against machines and has no cost for lying.
              </p>
            </Reveal>

            <div className="mt-8 flex items-center gap-3 font-mono text-xs">
              <span className="text-signal">{pad(active + 1)}</span>
              <span className="text-faint">/ {pad(INCIDENTS.length)}</span>
              <span className="h-px flex-1 bg-line" />
              <span className="uppercase tracking-wider text-muted">{INCIDENTS[active]!.src.split('·')[0].trim()}</span>
            </div>

            <Reveal delay={0.18}>
              <p className="mt-7 font-mono text-xs leading-relaxed text-faint">
                Google rejects AI submissions · maintainers told to treat them as malicious · $12.5M deployed just to bail them out.
              </p>
            </Reveal>
          </div>

          {/* progress rail + incident cards */}
          <div className="break-list relative grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 gap-y-3">
            <span className="pointer-events-none absolute left-3 top-6 bottom-6 w-px -translate-x-1/2 bg-line" />
            <span
              className="break-fill pointer-events-none absolute left-3 top-6 w-px origin-top -translate-x-1/2 bg-signal"
              style={{ height: 'calc(100% - 48px)', transform: 'scaleY(0)' }}
            />

            {INCIDENTS.map((incident, i) => (
              <Fragment key={incident.title}>
                <div className="relative flex justify-center">
                  <span
                    className={cn(
                      'absolute top-7 size-3 -translate-y-1/2 border transition-all duration-300',
                      i <= active
                        ? 'border-signal bg-signal shadow-[0_0_10px_rgba(180,230,50,0.7)]'
                        : 'border-line bg-bg',
                    )}
                  />
                </div>

                <a href={incident.href} target="_blank" rel="noreferrer" className="break-card group block">
                  <Card tone={i === active ? 'signal' : 'line'} className={cn('p-6 transition-colors', i === active ? 'bg-surface' : 'group-hover:bg-surface/70')}>
                    <div className="flex items-start gap-4">
                      <XCircle className="mt-0.5 size-5 shrink-0 text-slash" />
                      <div>
                        <h3 className="flex items-center gap-1.5 font-mono text-sm font-bold uppercase tracking-wide text-ink">
                          {incident.title} <ArrowUpRight className="size-3.5 text-faint transition-colors group-hover:text-slash" />
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{incident.body}</p>
                        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-faint">{incident.src}</p>
                      </div>
                    </div>
                  </Card>
                </a>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
