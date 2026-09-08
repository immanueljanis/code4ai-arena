import { CheckCircle2, XCircle } from 'lucide-react'
import { Card, cn, Reveal, SectionLabel } from '../ui'
import { wrap } from './shared'

function Verdict({ tone, icon: Icon, title, line, pts }: { tone: 'valid' | 'slash'; icon: typeof CheckCircle2; title: string; line: string; pts: string[] }) {
  const c = tone === 'valid' ? 'text-lime' : 'text-slash'
  const dot = tone === 'valid' ? 'bg-lime' : 'bg-slash'
  return (
    <Card tone={tone === 'valid' ? 'lime' : 'slash'} className="h-full p-7">
      <div className="flex items-center gap-3">
        <Icon className={cn('size-6', c)} />
        <span className={cn('font-mono text-sm font-bold tracking-[0.2em]', c)}>{title}</span>
      </div>
      <p className="mt-5 text-lg font-medium leading-snug text-ink">{line}</p>
      <ul className="mt-6 space-y-3">
        {pts.map((p) => (
          <li key={p} className="flex items-center gap-3 font-mono text-[13px] text-muted">
            <span className={cn('size-1.5', dot)} /> {p}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function Proof() {
  return (
    <section id="proof" className="relative py-28">
      <div className={wrap}>
        <div className="text-center">
          <div className="flex justify-center"><SectionLabel>proof-of-exploit</SectionLabel></div>
          <h2 className="mx-auto mt-5 max-w-2xl font-mono text-3xl font-bold uppercase tracking-tight text-balance sm:text-4xl">A finding is real only if it runs.</h2>
          <p className="mx-auto mt-5 max-w-lg leading-relaxed text-muted">
            Every submission is executed against a fresh instance of the target. The invariant either breaks or it doesn’t. You cannot fake an exploit that actually fires.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <Reveal>
            <Verdict tone="valid" icon={CheckCircle2} title="VALID" line="Invariant broke under the exploit." pts={['Bounty paid + stake returned', 'Outcome recorded on-chain', 'Auditor reputation +1']} />
          </Reveal>
          <Reveal delay={0.1}>
            <Verdict tone="slash" icon={XCircle} title="SLASHED" line="Invariant held. The exploit never fired." pts={['Stake slashed to treasury', 'Spam now has a cost', 'Reputation reflects the miss']} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
