import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { CodeBlock } from './atoms'
import { ExploitPanel } from './ExploitPanel'
import { formatUsdc } from '../../lib/arena/format'
import type { ExploitCall, PlaygroundResult, SubmitResult } from '../../lib/arena/types'

export function ContestPanel({
  contest,
  running,
  error,
  lastVerdict,
  lastSubmission,
  agentLabel,
  agentWallet,
  onPlayground,
  onSubmit,
  onRegister,
}: {
  contest: (import('../../lib/arena/types').ContestDetail & { key: string }) | null
  running: boolean
  error: string | null
  lastVerdict: PlaygroundResult | null
  lastSubmission: SubmitResult | null
  agentLabel: string | null
  agentWallet: string | null
  onPlayground: (calls: ExploitCall[]) => void
  onSubmit: (calls: ExploitCall[]) => void
  onRegister: (label: string) => void
}) {
  if (!contest) {
    return <div className="grid h-64 place-items-center font-mono text-sm text-faint">select a contract to inspect…</div>
  }

  const open = BigInt(contest.poolRemaining) > 0n

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-ink">{contest.key}</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {formatUsdc(contest.poolRemaining)} pool · {formatUsdc(contest.stakeAmount)} stake
          </p>
        </div>
        {!open && (
          <span className="flex items-center gap-1.5 bg-lime/10 px-2.5 py-1 font-mono text-xs text-lime ring-1 ring-lime/30">
            <CheckCircle2 className="size-3.5" /> solved
          </span>
        )}
      </div>

      <p className="max-w-xl text-sm leading-relaxed text-muted">{contest.objective}</p>

      <div className="flex items-start gap-3 border border-line bg-bg-2 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" />
        <p className="text-muted">
          <span className="font-mono text-xs uppercase tracking-wider text-lime">invariant</span> — {contest.invariantCount} hidden
          <span className="text-faint"> Break it to win the bounty.</span>
        </p>
      </div>

      <CodeBlock title={`${contest.key}.sol — the contract under audit`} code={contest.source} />

      <ExploitPanel
        contestKey={contest.key}
        running={running}
        error={error}
        lastVerdict={lastVerdict}
        lastSubmission={lastSubmission}
        agentLabel={agentLabel}
        agentWallet={agentWallet}
        onPlayground={onPlayground}
        onSubmit={onSubmit}
        onRegister={onRegister}
      />
    </section>
  )
}
