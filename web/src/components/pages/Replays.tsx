import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, History, ShieldAlert } from 'lucide-react'
import { Button, Card, Tag, cn, wrap } from '../ui'
import { SiteNav } from '../site/SiteNav'
import { SiteFooter } from '../site/SiteFooter'
import { PageHero } from '../site/PageHero'
import { PageTransition } from '../site/PageTransition'

type Replay = {
  targetKey: string
  incident: string
  year: string
  className: string
  loss: string
  story: string
  sourceLabel: string
  sourceUrl: string
}

type GraphReplay = Replay & {
  attackTx: string
}

const REPLAYS: Replay[] = [
  {
    targetKey: 'access-control-vault',
    incident: 'Poly Network',
    year: '2021',
    className: 'cross-chain access control failure',
    loss: '$611M',
    story: 'A privileged cross-chain message path let an attacker replace the keeper and call protected functionality.',
    sourceLabel: 'incident report',
    sourceUrl: 'https://medium.com/poly-network/honour-exploit-and-code-how-we-lost-610m-dollar-and-got-it-back-c4a7d0606267',
  },
  {
    targetKey: 'rounding-vault',
    incident: 'Hundred Finance',
    year: '2023',
    className: 'first-depositor share inflation',
    loss: '$7.4M',
    story: 'A tiny first deposit and a direct donation distorted the share price until later deposits rounded down to dust.',
    sourceLabel: 'exploit analysis',
    sourceUrl: 'https://www.smartcontractaudit.com/guides/hundred-finance-2023-erc4626-donation-attack',
  },
  {
    targetKey: 'reentrancy-vault',
    incident: 'The DAO',
    year: '2016',
    className: 'recursive withdrawal before state update',
    loss: '~$50M',
    story: 'A callback re-entered the split path before the first withdrawal updated its balance, repeating the transfer in one transaction.',
    sourceLabel: 'Ethereum Foundation',
    sourceUrl: 'https://blog.ethereum.org/2016/06/17/critical-update-re-dao-vulnerability',
  },
]

function ReplayCard({ replay, index }: { replay: Replay; index: number }) {
  return (
    <Card interactive className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between border-b border-line/60 pb-4">
        <Tag tone="lime">0{index + 1} · {replay.year}</Tag>
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{replay.targetKey}</span>
      </div>
      <h2 className="mt-5 font-mono text-2xl font-extrabold uppercase tracking-tight text-ink">{replay.incident}</h2>
      <p className="mt-2 font-mono text-xs uppercase tracking-wider text-lime">{replay.className}</p>
      <p className="mt-5 flex-1 text-sm leading-relaxed text-muted">{replay.story}</p>
      <div className="mt-6 flex items-end justify-between border-t border-line/60 pt-4">
        <div>
          <div className="font-mono text-2xl font-extrabold text-slash">{replay.loss}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">reported loss</div>
        </div>
        <a href={replay.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-ink">
          {replay.sourceLabel} <ExternalLink className="size-3.5" />
        </a>
      </div>
      <Button variant="primary" to="/arena" search={{ target: replay.targetKey }} className="mt-6 w-full">
        Play in Playground <ArrowRight className="size-4" />
      </Button>
    </Card>
  )
}

export function ReplaysPage() {
  const [replays, setReplays] = useState<Replay[]>(REPLAYS)

  useEffect(() => {
    const endpoint = import.meta.env.VITE_SUBGRAPH_URL as string | undefined
    if (!endpoint) return
    const query = `query ExploitHistory { historicalExploits(first: 10, orderBy: timestamp, orderDirection: desc) { targetKey incident technique lossUsd attackTx sourceUrl timestamp } }`
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    })
      .then((response) => response.json() as Promise<{ data?: { historicalExploits?: GraphReplay[] } }>)
      .then((body) => {
        const history = body.data?.historicalExploits
        if (history?.length) setReplays(history)
      })
      .catch(() => undefined)
  }, [])

  return (
    <main className="min-h-screen bg-bg">
      <SiteNav active="/replays" />
      <PageTransition>
        <PageHero
          eyebrow="replay gallery · historical exploit patterns"
          title="Study the break."
          accent="Replay the proof."
          subtitle="Three real Ethereum incidents, reduced to the bug shape. Read the path, then run the corresponding target in the free local playground."
        >
          <Tag tone="lime"><History className="mr-1.5 size-3" /> 3 playable patterns</Tag>
        </PageHero>

        <section className="py-12">
          <div className={cn(wrap, 'grid gap-4 lg:grid-cols-3')}>
            {replays.map((replay, index) => <ReplayCard key={replay.targetKey} replay={replay} index={index} />)}
          </div>
        </section>

        <section className="border-t border-line py-12">
          <div className={cn(wrap, 'grid gap-6 md:grid-cols-[1fr_2fr]')}>
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-lime">the replay loop</span>
              <h2 className="mt-3 font-mono text-3xl font-extrabold uppercase tracking-tight text-ink">Read. Build. Prove.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['01', 'Read the incident', 'See the historical failure mode and the path an attacker used.'],
                ['02', 'Build the calls', 'Translate the pattern into the target’s public entry points.'],
                ['03', 'Prove the flip', 'Run fresh in Playground and watch the invariant verdict.'],
              ].map(([number, title, body]) => (
                <Card key={number} className="p-5">
                  <ShieldAlert className="size-5 text-lime" />
                  <div className="mt-5 font-mono text-xs text-faint">{number}</div>
                  <h3 className="mt-2 font-mono text-sm font-bold uppercase text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </PageTransition>
      <SiteFooter />
    </main>
  )
}
