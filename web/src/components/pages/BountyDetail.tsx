import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button, Card, TestTokenBadge, cn, wrap } from '../ui'
import { SiteNav } from '../site/SiteNav'
import { SiteFooter } from '../site/SiteFooter'
import { PageTransition } from '../site/PageTransition'
import { createArenaClient } from '../../lib/arena/client'
import { SETTLEMENT_SYMBOL, formatUsdc } from '../../lib/arena/format'
import type { ContestDetail } from '../../lib/arena/types'

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'lime' }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-3 last:border-b-0">
      <span className="font-mono text-xs uppercase tracking-wider text-faint">{label}</span>
      <span className={cn('font-mono text-sm', tone === 'lime' ? 'text-lime' : 'text-ink')}>{value}</span>
    </div>
  )
}

export function BountyDetailPage({ bountyKey }: { bountyKey: string }) {
  const client = useMemo(() => createArenaClient(), [])
  const [bounty, setBounty] = useState<ContestDetail | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    void client.getContest(bountyKey).then((d) => {
      if (active) setBounty(d)
    })
    return () => {
      active = false
    }
  }, [client, bountyKey])

  if (bounty === undefined) return null

  if (!bounty) {
    return (
      <main className="min-h-screen bg-bg">
        <SiteNav active="/bounties" />
        <div className="grid min-h-[60vh] place-items-center px-6 text-center">
          <div>
            <p className="font-mono text-sm text-muted">bounty not found</p>
            <Link to="/bounties" className="mt-4 inline-flex items-center gap-1.5 font-mono text-sm text-lime">
              <ArrowLeft className="size-4" /> back to bounties
            </Link>
          </div>
        </div>
        <SiteFooter />
      </main>
    )
  }

  const solved = BigInt(bounty.poolRemaining) <= 0n

  return (
    <main className="min-h-screen bg-bg">
      <SiteNav active="/bounties" />

      <PageTransition>
        <section className="relative overflow-hidden border-b border-line pt-32 pb-12 sm:pt-36">
          <div className="pointer-events-none absolute inset-0 grid-dots opacity-40" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 signal-glow" />
          <div className={cn(wrap, 'relative')}>
            <Link to="/bounties" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-ink">
              <ArrowLeft className="size-4" /> bounties
            </Link>

            <div className="mt-6 flex items-center gap-3">
              <span className="grid size-7 place-items-center bg-lime/10 font-mono text-xs font-bold text-lime ring-1 ring-lime/20">
                {bounty.key.charAt(0)}
              </span>
              <span className="font-mono text-sm text-muted">
                target <span className="text-ink">{bounty.key}</span>
              </span>
              {solved && (
                <span className="inline-flex items-center gap-1 font-mono text-xs text-lime">
                  <CheckCircle2 className="size-3.5" /> solved
                </span>
              )}
            </div>

            <h1 className="mt-4 font-mono text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">{bounty.key}</h1>
            <p className="mt-2 font-mono text-sm text-muted">{bounty.objective}</p>
          </div>
        </section>

        <section className="py-12">
          <div className={cn(wrap, 'grid gap-6 lg:grid-cols-[1fr_340px]')}>
            <div className="flex flex-col gap-5">
              <Card className="p-6">
                <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
                  <ShieldAlert className="size-3.5 text-lime" /> invariant to break
                </h2>
                <p className="mt-4 text-lg font-medium leading-snug text-ink">
                  {bounty.invariantCount} hidden invariant{bounty.invariantCount === 1 ? '' : 's'}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Submit an exploit that drives the target so its rule no longer holds. The verifier deploys a fresh
                  instance, runs your exploit, and pays only if the invariant flips from true to false.
                </p>
              </Card>

              <Card className="p-6">
                <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
                  <ShieldCheck className="size-3.5 text-lime" /> how it pays
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {[
                    `Stake 1 ${SETTLEMENT_SYMBOL} via x402 to submit — junk is slashed`,
                    'Exploit runs on-chain — no human judge',
                    'Invariant breaks → bounty + stake returned, settled via x402',
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-3 font-mono text-[13px] text-muted">
                      <span className="size-1.5 bg-lime" /> {t}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-6">
                <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
                  <ShieldCheck className="size-3.5 text-lime" /> source
                </h2>
                <pre className="mt-4 max-h-96 overflow-auto border border-line bg-bg-2 p-4 font-mono text-[11px] leading-relaxed text-muted">
                  <code>{bounty.source}</code>
                </pre>
              </Card>
            </div>

            {/* reward / action */}
            <Card tone="lime" className="flex h-fit flex-col p-6">
              <Coins className="size-5 text-lime" />
              <div className="mt-3 font-mono text-4xl font-extrabold text-lime">{formatUsdc(bounty.poolRemaining)}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-faint">pool remaining</div>
              <div className="mt-2"><TestTokenBadge /></div>

              <div className="mt-5">
                <Stat label="stake" value={formatUsdc(bounty.stakeAmount)} />
                <Stat label="invariants" value={bounty.invariantCount} />
                <Stat label="status" value={solved ? 'solved' : 'open'} tone={solved ? 'lime' : undefined} />
              </div>

              {solved ? (
                <div className="mt-6 border border-line bg-bg/40 p-3 text-center font-mono text-xs text-muted">
                  pool exhausted
                </div>
              ) : (
                <Button variant="primary" to="/arena" className="mt-6 w-full">
                  Break it in the arena <ArrowRight className="size-4" />
                </Button>
              )}
            </Card>
          </div>
        </section>
      </PageTransition>

      <SiteFooter />
    </main>
  )
}
