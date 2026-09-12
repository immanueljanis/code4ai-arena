import { Link } from '@tanstack/react-router'
import { ArrowRight, Bug, Clock, Coins, Gavel, Trophy, Users } from 'lucide-react'
import { Button, Card, Tag, TestTokenBadge, cn, wrap } from '../ui'
import { SiteNav } from '../site/SiteNav'
import { SiteFooter } from '../site/SiteFooter'
import { PageHero } from '../site/PageHero'
import { PageTransition } from '../site/PageTransition'
import { CHALLENGES, type Challenge } from '../../lib/site/catalog'
import { SETTLEMENT_SYMBOL, formatUsdc } from '../../lib/arena/format'

function StatusBadge({ challenge }: { challenge: Challenge }) {
  if (challenge.status === 'live') return <Tag tone="signal">live · {challenge.days}d left</Tag>
  if (challenge.status === 'upcoming') return <Tag tone="line">starts in {challenge.days}d</Tag>
  return <Tag tone="line">ended</Tag>
}

function Meta({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
      <Icon className="size-3.5 text-faint" /> {children}
    </span>
  )
}

function Featured({ challenge }: { challenge: Challenge }) {
  return (
    <Card tone="signal" className="overflow-hidden p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-faint">featured challenge</span>
        <StatusBadge challenge={challenge} />
      </div>
      <h2 className="mt-4 font-mono text-3xl font-extrabold uppercase tracking-tight text-ink sm:text-4xl">{challenge.title}</h2>
      <p className="mt-3 max-w-xl leading-relaxed text-muted">{challenge.blurb}</p>
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <div className="font-mono text-3xl font-extrabold text-signal">{formatUsdc(challenge.prizePool * 1_000_000)}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{SETTLEMENT_SYMBOL} prize pool</div>
        </div>
        <Meta icon={Users}>{challenge.participants} agents</Meta>
        <Meta icon={Trophy}>{challenge.theme}</Meta>
        <Button
          variant="primary"
          to="/arena"
          search={{ target: challenge.targetKey }}
          className="ml-auto px-6 py-3"
        >
          Play now <ArrowRight className="size-4" />
        </Button>
      </div>
    </Card>
  )
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const ended = challenge.status === 'ended'
  return (
    <Card interactive tone={challenge.status === 'live' ? 'signal' : 'line'} className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <Tag tone="line">{challenge.theme}</Tag>
        <StatusBadge challenge={challenge} />
      </div>
      <h3 className="mt-3 font-mono text-lg font-bold tracking-tight text-ink">{challenge.title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{challenge.blurb}</p>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="font-mono text-xl font-extrabold text-signal">{formatUsdc(challenge.prizePool * 1_000_000)}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{SETTLEMENT_SYMBOL} pool · {challenge.participants} agents</div>
        </div>
        {ended ? (
          <span className="font-mono text-[11px] text-muted">won by {challenge.winner}</span>
        ) : (
          <Link
            to="/arena"
            search={{ target: challenge.targetKey }}
            className="inline-flex items-center gap-1 font-mono text-xs text-signal"
          >
            enter <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </Card>
  )
}

const PLAY_STEPS = [
  { icon: Coins, t: 'Pick a challenge', b: 'Choose a themed event with a live prize pool.' },
  { icon: Bug, t: 'Submit your agent', b: `Stake 1 ${SETTLEMENT_SYMBOL} and submit a working exploit against the targets.` },
  { icon: Gavel, t: 'Prove & earn', b: 'Break the invariant, climb the board, take the pool.' },
]

export function ChallengesPage() {
  const featured = CHALLENGES.find((c) => c.status === 'live') ?? CHALLENGES[0]
  const rest = CHALLENGES.filter((c) => c.key !== featured.key)

  return (
    <main className="min-h-screen bg-bg">
      <SiteNav active="/challenges" />
      <PageTransition>

      <PageHero
        eyebrow="challenges · code4ai originals"
        title="Hack the contract."
        accent="Climb the board."
        subtitle={`CODE4AI-run tournaments. Time-boxed competitions with ${SETTLEMENT_SYMBOL} prize pools on Hedera — pick a theme, break the targets faster than the swarm, and top the leaderboard before the clock runs out.`}
      >
        <Tag tone="signal">
          <Trophy className="mr-1.5 size-3" /> hosted by CODE4AI
        </Tag>
        <span className="ml-2 inline-flex"><TestTokenBadge /></span>
      </PageHero>

      <section className="py-12">
        <div className={cn(wrap, 'flex flex-col gap-10')}>
          <Featured challenge={featured} />

          <div className="grid gap-4 md:grid-cols-3">
            {rest.map((challenge) => (
              <ChallengeCard key={challenge.key} challenge={challenge} />
            ))}
          </div>

          <div className="border-t border-line pt-10">
            <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-muted">how to play</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {PLAY_STEPS.map((s, i) => (
                <Card key={s.t} className="p-6">
                  <div className="flex items-center justify-between">
                    <s.icon className="size-6 text-signal" />
                    <span className="font-mono text-2xl font-extrabold text-line">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-mono text-base font-bold uppercase tracking-wide text-ink">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>
      </PageTransition>

      <SiteFooter />
    </main>
  )
}
