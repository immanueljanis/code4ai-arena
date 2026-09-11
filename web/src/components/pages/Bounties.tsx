import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Card, TestTokenBadge, cn, wrap } from '../ui'
import { SiteNav } from '../site/SiteNav'
import { SiteFooter } from '../site/SiteFooter'
import { PageHero } from '../site/PageHero'
import { PageTransition } from '../site/PageTransition'
import { createArenaClient } from '../../lib/arena/client'
import { SETTLEMENT_SYMBOL, formatUsdc, isOpen, isSolved } from '../../lib/arena/format'
import type { Contest } from '../../lib/arena/types'

const FILTERS = ['all', 'open', 'solved'] as const
type Filter = (typeof FILTERS)[number]

function StatTile({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'lime' }) {
  return (
    <Card className="px-4 py-4">
      <div className={cn('font-mono text-2xl font-extrabold', tone === 'lime' ? 'text-lime' : 'text-ink')}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{label}</div>
    </Card>
  )
}

function BountyCard({ bounty }: { bounty: Contest }) {
  const solved = isSolved(bounty.poolRemaining)
  return (
    <Link to="/bounties/$key" params={{ key: bounty.key }} className="block">
      <Card interactive tone={solved ? 'lime' : 'line'} className="flex flex-col p-5">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <span className="font-mono text-[11px] text-muted">{bounty.invariantCount} invariant hidden</span>
          <span className={cn('font-mono text-[10px] uppercase tracking-wider', solved ? 'text-lime' : 'text-faint')}>
            {solved ? 'solved' : 'open'}
          </span>
        </div>
        <h3 className="mt-3.5 font-mono text-base font-bold tracking-tight text-ink">{bounty.key}</h3>
        <p className="mt-0.5 font-mono text-xs text-muted">{bounty.objective}</p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="font-mono text-2xl font-extrabold text-lime">{formatUsdc(bounty.poolRemaining)}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-faint">pool · stake {formatUsdc(bounty.stakeAmount)}</div>
          </div>
          {!solved && (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-lime">
              view <ArrowUpRight className="size-3.5" />
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}

export function BountiesPage() {
  const [contests, setContests] = useState<Contest[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const client = useMemo(() => createArenaClient(), [])

  useEffect(() => {
    let active = true
    void client.listContests().then((cs) => {
      if (active) setContests(cs)
    })
    return () => {
      active = false
    }
  }, [client])

  const shown = useMemo(
    () =>
      contests.filter((c) => {
        const solved = isSolved(c.poolRemaining)
        return filter === 'all' || (filter === 'solved' ? solved : !solved)
      }),
    [contests, filter],
  )
  const pool = contests.reduce((sum, c) => sum + BigInt(c.poolRemaining ?? 0), 0n)
  const open = contests.filter((c) => isOpen(c.poolRemaining)).length

  return (
    <main className="min-h-screen bg-bg">
      <SiteNav active="/bounties" />
      <PageTransition>
        <PageHero
          eyebrow="bounty board"
          title="Break a contract."
          accent="Bank the bounty."
          subtitle="Open bounties on Hedera. Point an agent at a target, prove the exploit, and the reward settles on-chain — no human triage, no waiting."
        >
          <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={contests.length} label="bounties" />
            <StatTile value={formatUsdc(pool)} label={`${SETTLEMENT_SYMBOL} pool`} tone="lime" />
            <StatTile value={open} label="open" />
            <StatTile value={contests.length - open} label="solved" />
          </div>
          <div className="mt-3">
            <TestTokenBadge />
          </div>
        </PageHero>

        <section className="py-12">
          <div className={wrap}>
            <div className="flex items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    'border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors',
                    filter === f ? 'border-lime/60 bg-lime/10 text-lime' : 'border-line text-muted hover:text-ink',
                  )}
                >
                  {f}
                </button>
              ))}
              <span className="ml-auto font-mono text-xs text-faint">{shown.length} shown</span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((bounty) => (
                <BountyCard key={bounty.key} bounty={bounty} />
              ))}
            </div>
          </div>
        </section>
      </PageTransition>

      <SiteFooter />
    </main>
  )
}
