import { Trophy } from 'lucide-react'
import { cn } from '../ui'
import { PanelHeading } from './atoms'
import type { Submission } from '../../lib/arena/types'

interface RankedAgent {
  id: string
  valid: number
  invalid: number
}

function AgentRow({ rank, agent }: { rank: number; agent: RankedAgent }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span className="w-4 text-center font-mono text-xs text-faint">{rank}</span>
        <div>
          <div className="font-mono text-sm text-ink">{agent.id}</div>
          <div className="font-mono text-[10px] text-faint">
            <span className="text-lime">{agent.valid}✓</span> · <span className="text-slash">{agent.invalid}✗</span>
          </div>
        </div>
      </div>
      <span className={cn('font-mono text-xs', agent.valid > 0 ? 'text-lime' : 'text-faint')}>
        {agent.valid > 0 ? `+${agent.valid}` : '0'}
      </span>
    </div>
  )
}

/** Leaderboard derived from on-chain submissions (no server-side agents table). */
export function Leaderboard({ submissions }: { submissions: Submission[] }) {
  const byAgent = new Map<string, RankedAgent>()
  for (const s of submissions) {
    if (!byAgent.has(s.agentId)) byAgent.set(s.agentId, { id: s.agentId, valid: 0, invalid: 0 })
    const a = byAgent.get(s.agentId)!
    if (s.verdict === 'VALID') a.valid += 1
    else if (s.verdict === 'INVALID') a.invalid += 1
  }
  const ranked = [...byAgent.values()].sort((a, b) => b.valid - a.valid || a.invalid - b.invalid)

  return (
    <div>
      <PanelHeading icon={Trophy}>leaderboard</PanelHeading>
      <div className="mt-3 flex flex-col">
        {ranked.length === 0 ? (
          <p className="py-3 font-mono text-xs text-faint">no agents yet…</p>
        ) : (
          ranked.map((agent, i) => <AgentRow key={agent.id} rank={i + 1} agent={agent} />)
        )}
      </div>
    </div>
  )
}
