import { ShieldAlert } from 'lucide-react'
import { Card, cn } from '../ui'
import { PanelHeading } from './atoms'
import { formatUsdc } from '../../lib/arena/format'
import type { Contest } from '../../lib/arena/types'

function ContestCard({ contest, active, onSelect }: { contest: Contest; active: boolean; onSelect: (key: string) => void }) {
  const open = BigInt(contest.poolRemaining) > 0n
  return (
    <button type="button" onClick={() => onSelect(contest.key)} className="block w-full text-left">
      <Card interactive tone={active ? 'lime' : 'line'} className={cn('p-4', active && 'bg-surface')}>
        <div className="flex items-center justify-between">
          <span className={cn('font-mono text-[10px] uppercase tracking-wider', open ? 'text-faint' : 'text-lime')}>
            {open ? 'open' : 'solved'}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{contest.invariantCount} invariant</span>
        </div>
        <div className="mt-2.5 font-mono text-sm font-bold tracking-tight text-ink">{contest.key}</div>
        <div className="mt-0.5 font-mono text-xs text-muted">{contest.objective}</div>
        <div className="mt-3 flex items-center justify-between font-mono text-xs">
          <span className="text-lime">{formatUsdc(contest.poolRemaining)} pool</span>
          <span className="text-faint">stake {formatUsdc(contest.stakeAmount)}</span>
        </div>
      </Card>
    </button>
  )
}

export function ContestBoard({
  contests,
  selectedKey,
  onSelect,
}: {
  contests: Contest[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  return (
    <aside className="flex flex-col gap-3">
      <PanelHeading icon={ShieldAlert}>contracts under audit</PanelHeading>
      <div className="flex flex-col gap-2.5">
        {contests.map((contest) => (
          <ContestCard key={contest.key} contest={contest} active={contest.key === selectedKey} onSelect={onSelect} />
        ))}
      </div>
    </aside>
  )
}
