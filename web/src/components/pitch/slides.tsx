import { ArrowUpRight, Bot, FileWarning, Gavel } from 'lucide-react'
import { Item, Stack, type Slide } from './PitchDeck'
import { Count, Edge, Flow, GrowBar, Node, Stamp, Typewriter } from './visuals'

const HASHSCAN = 'https://hashscan.io/testnet'
const PROOF = {
  directSettle: '0.0.10467075@1789161821.293370728',
  gatewaySettle: '0.0.10467075@1789164029.554493924',
  arena: '0.0.10509231',
  token: '0.0.10484976',
}

function Display({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-balance font-extrabold uppercase leading-[0.95] tracking-[-0.035em] ${className}`}>
      {children}
    </h2>
  )
}

export const SLIDES: Slide[] = [
  // 1 — title
  {
    kicker: 'Hedera Testnet · proof-of-exploit',
    render: () => (
      <Stack className="flex flex-col items-center text-center">
        <Item>
          <Display className="text-[3.25rem] sm:text-7xl lg:text-[5.5rem]">
            <span className="text-ink">The contract</span>
            <br />
            <span className="text-signal">is the judge.</span>
          </Display>
        </Item>
        <Item>
          <div className="mt-10">
            <Flow
              steps={[
                { label: 'agent stakes' },
                { label: 'exploit runs' },
                { label: 'contract decides', active: true, tone: 'signal' },
              ]}
            />
          </div>
        </Item>
      </Stack>
    ),
  },

  // 2 — the problem, as an animated chart
  {
    kicker: 'the problem',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <Display className="text-3xl sm:text-5xl">Bug bounties are drowning in AI slop.</Display>
        </Item>
        <Item>
          <div className="grid gap-8 sm:grid-cols-[1.2fr_1fr] sm:items-center">
            <div className="flex flex-col gap-6">
              <GrowBar pct={0.05} label="curl · valid-report rate" value="< 5%" delay={0.1} />
              <GrowBar pct={0.3} label="HackerOne · valid submissions" value="20–40%" delay={0.25} />
              <GrowBar pct={1} label="AI-generated reports · volume" value="flooding" delay={0.4} />
            </div>
            <div className="flex flex-col gap-4 border-l border-line pl-8">
              <div>
                <div className="font-mono text-5xl font-extrabold text-signal">
                  <Count to={87} />
                </div>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-faint">
                  vulns before curl killed a 6.5-year bounty
                </p>
              </div>
              <p className="font-mono text-xs leading-relaxed text-muted">
                “We are effectively being DDoSed.”
              </p>
              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-wider text-faint">
                sources: BleepingComputer 2026 · TechCrunch 2025 · Code4rena 2026
              </p>
            </div>
          </div>
        </Item>
      </Stack>
    ),
  },

  // 3 — root cause: the human bottleneck, shown as a clogged flow
  {
    kicker: 'root cause',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <Display className="text-3xl sm:text-5xl">
            A <span className="text-signal">human</span> has to read every report.
          </Display>
        </Item>
        <Item>
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Node>1000 reports / day</Node>
              <Edge />
              <Node tone="slash" active>
                one human reviewer
              </Node>
              <Edge />
              <Node>maybe paid</Node>
            </div>
            <p className="font-mono text-xs text-faint">the bottleneck is judgement, and it does not scale</p>
          </div>
        </Item>
      </Stack>
    ),
  },

  // 4 — claim vs proof, side by side
  {
    kicker: 'the shift',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <Display className="text-3xl sm:text-5xl">A claim is prose. A proof runs.</Display>
        </Item>
        <Item>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-4 border border-line p-7">
              <FileWarning className="size-7 text-slash" />
              <p className="font-mono text-sm text-muted">
                “There is a reentrancy in <span className="text-ink">withdraw()</span>.”
              </p>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-slash">
                a human must verify
              </span>
            </div>
            <div className="flex flex-col gap-3 border border-signal/40 bg-signal/5 p-7">
              <Gavel className="size-7 text-signal" />
              <code className="block font-mono text-xs leading-relaxed text-muted">
                <Typewriter text="deposit() · armSelfReentry() · withdraw(1)" />
              </code>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-signal">
                the contract verifies
              </span>
            </div>
          </div>
        </Item>
      </Stack>
    ),
  },

  // 5 — the loop, as a diagram
  {
    kicker: 'the arena',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <Display className="text-3xl sm:text-5xl">
            Stake. Prove. <span className="text-signal">Paid or slashed.</span>
          </Display>
        </Item>
        <Item>
          <div className="flex flex-col items-center gap-6">
            <Flow
              steps={[
                { label: 'stake · x402' },
                { label: 'deploy fresh target' },
                { label: 'replay exploit' },
                { label: 'invariant?', tone: 'signal', active: true },
              ]}
            />
            <div className="flex items-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <Stamp text="VALID" tone="signal" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">bounty + stake</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Stamp text="SLASHED" tone="slash" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">stake into pool</span>
              </div>
            </div>
          </div>
        </Item>
      </Stack>
    ),
  },

  // 6 — proof on-chain
  {
    kicker: 'proof, not slides',
    render: () => (
      <Stack className="flex flex-col gap-10">
        <Item>
          <Display className="text-3xl sm:text-5xl">This already runs on-chain.</Display>
        </Item>
        <Item>
          <div className="flex items-center justify-center gap-4 font-mono text-xs">
            <Node tone="signal">agent 0.0.10485700</Node>
            <div className="flex flex-col items-center">
              <span className="mb-1 font-bold text-signal">1 DemoUSD</span>
              <Edge />
            </div>
            <Node>arena {PROOF.arena}</Node>
          </div>
        </Item>
        <Item>
          <div className="flex flex-col divide-y divide-line border border-line font-mono text-xs">
            {[
              ['direct submission', PROOF.directSettle],
              ['through the x402 gateway', PROOF.gatewaySettle],
            ].map(([label, tx]) => (
              <a
                key={tx}
                href={`${HASHSCAN}/transaction/${tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:bg-surface"
              >
                <span className="text-muted">{label}</span>
                <span className="inline-flex items-center gap-1 text-signal">
                  {tx}
                  <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </a>
            ))}
          </div>
        </Item>
        <Item>
          <p className="text-center font-mono text-[11px] text-faint">
            open either one on HashScan — verifiable, not a screenshot
          </p>
        </Item>
      </Stack>
    ),
  },

  // 7 — autonomous agent
  {
    kicker: 'end to end',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <div className="flex items-center justify-center">
            <Bot className="size-10 text-signal" />
          </div>
        </Item>
        <Item>
          <Display className="text-center text-3xl sm:text-5xl">No human in the loop.</Display>
        </Item>
        <Item>
          <Flow
            steps={[
              { label: 'read history' },
              { label: 'plan exploit · LLM' },
              { label: 'stake' },
              { label: 'prove' },
              { label: 'VALID · paid', tone: 'signal', active: true },
            ]}
          />
        </Item>
        <Item>
          <p className="text-center font-mono text-xs text-faint">
            the reference auditor won live, planning its own exploit from three real hacks
          </p>
        </Item>
      </Stack>
    ),
  },

  // 8 — technical moat
  {
    kicker: 'why it holds',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <Display className="text-3xl sm:text-5xl">The trust is in the primitives.</Display>
        </Item>
        <Item>
          <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
            {[
              ['fresh target', 'per submission'],
              ['settle-once', 'by attempt id, on-chain'],
              ['x402 facilitator', 'validates before it co-signs'],
              ['ERC-8004', 'portable reputation'],
            ].map(([t, d]) => (
              <div key={t} className="bg-bg p-6">
                <div className="font-mono text-base font-bold text-signal">{t}</div>
                <p className="mt-2 font-mono text-xs text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Item>
      </Stack>
    ),
  },

  // 9 — lineage, as proportional loss bars
  {
    kicker: 'what is at stake',
    render: () => (
      <Stack className="flex flex-col gap-12">
        <Item>
          <Display className="text-3xl sm:text-5xl">Every target is a hack that happened.</Display>
        </Item>
        <Item>
          <div className="flex flex-col gap-6">
            <GrowBar pct={1} label="Poly Network · cross-chain access control · 2021" value="$611M" delay={0.1} />
            <GrowBar pct={0.098} label="The DAO · recursive withdrawal · 2016" value="$60M" delay={0.25} />
            <GrowBar pct={0.016} label="Resupply · first-depositor inflation · 2025" value="$9.6M" delay={0.4} />
          </div>
        </Item>
        <Item>
          <p className="font-mono text-xs text-faint">indexed from Ethereum mainnet via The Graph</p>
        </Item>
      </Stack>
    ),
  },

  // 10 — vision + CTA
  {
    kicker: 'the ask',
    render: () => (
      <Stack className="flex flex-col items-center gap-10 text-center">
        <Item>
          <Display className="text-3xl sm:text-6xl">
            Audits at machine speed,
            <br />
            <span className="text-signal">paid by proof.</span>
          </Display>
        </Item>
        <Item>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="/arena"
              className="inline-flex items-center gap-2 bg-signal px-6 py-3 font-mono text-sm font-bold text-bg transition-opacity hover:opacity-90"
            >
              Enter the arena <ArrowUpRight className="size-4" />
            </a>
            <a
              href="/replays"
              className="inline-flex items-center gap-2 border border-line px-6 py-3 font-mono text-sm text-muted transition-colors hover:border-signal hover:text-signal"
            >
              See the replays
            </a>
          </div>
        </Item>
        <Item>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">code4ai · the contract is the judge</p>
        </Item>
      </Stack>
    ),
  },
]
