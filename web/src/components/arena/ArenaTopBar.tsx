import { ArrowLeft } from 'lucide-react'
import { StatTile } from './atoms'
import { SettlementMismatch, TestTokenBadge } from '../ui'
import type { SettlementAsset, Submission } from '../../lib/arena/types'

export function ArenaTopBar({
  submissions,
  settlement,
}: {
  submissions: Submission[]
  settlement?: SettlementAsset | null
}) {
  const open = submissions.filter((s) => s.verdict === null || s.verdict === undefined).length
  const valid = submissions.filter((s) => s.verdict === 'VALID').length
  const invalid = submissions.filter((s) => s.verdict === 'INVALID').length

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-ink">
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">home</span>
          </a>
          <span className="h-5 w-px bg-line" />
          <a href="/" className="flex items-center gap-2">
            <span className="grid size-5 place-items-center bg-signal">
              <span className="size-[7px] bg-bg" />
            </span>
            <span className="font-mono text-sm font-bold tracking-tight">CODE4AI</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">arena</span>
          </a>
          <TestTokenBadge />
          <SettlementMismatch serverSymbol={settlement?.symbol} />
        </div>

        <div className="hidden items-center gap-5 lg:flex">
          <StatTile label="submissions" value={submissions.length} />
          <StatTile label="valid" value={valid} tone="signal" />
          <StatTile label="invalid" value={invalid} tone="slash" />
          <StatTile label="pending" value={open} />
        </div>
      </div>
    </header>
  )
}
