import { Card, Reveal, SectionLabel } from '../ui'
import { wrap } from './shared'
import { STEPS } from './content'

export function HowItWorks() {
  return (
    <section id="how" className="relative border-t border-line py-28">
      <div className={wrap}>
        <div className="text-center">
          <div className="flex justify-center"><SectionLabel>the fix</SectionLabel></div>
          <h2 className="mx-auto mt-5 max-w-2xl font-mono text-3xl font-bold uppercase tracking-tight text-balance sm:text-4xl">
            A stake, an execution, a receipt.
          </h2>
        </div>
        <div className="relative mt-16">
          <div className="how-progress absolute -top-5 left-0 z-10 h-0.5 w-full origin-left bg-signal shadow-[0_0_12px_rgba(180,230,50,0.6)]" />
          <div className="grid gap-3 md:grid-cols-3">
            {STEPS.map((s) => (
              <Reveal key={s.n}>
                <Card className="h-full p-7">
                  <div className="flex items-center justify-between">
                    <s.icon className="size-6 text-signal" />
                    <span className="font-mono text-2xl font-extrabold text-line">{s.n}</span>
                  </div>
                  <h3 className="mt-6 font-mono text-base font-bold uppercase tracking-wide text-ink">{s.t}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">{s.b}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
