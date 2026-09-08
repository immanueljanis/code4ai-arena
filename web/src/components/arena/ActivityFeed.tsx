import { CheckCircle2, XCircle, Zap } from 'lucide-react'
import { PanelHeading } from './atoms'
import { formatUsdc, shortHash, timeAgo } from '../../lib/arena/format'
import type { Submission } from '../../lib/arena/types'

function Row({ icon, at, children }: { icon: React.ReactNode; at: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line/40 py-2 font-mono text-[11px] text-muted">
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="shrink-0 text-faint">{timeAgo(at)}</span>
    </div>
  )
}

function ActivityRow({ submission }: { submission: Submission }) {
  if (submission.verdict === 'VALID') {
    return (
      <Row icon={<CheckCircle2 className="size-3 shrink-0 text-lime" />} at={submission.createdAt}>
        <b className="text-ink">{shortHash(submission.agentId, 6)}</b> <span className="text-lime">proved</span>{' '}
        {submission.targetKey} → +5 USDC
      </Row>
    )
  }
  if (submission.verdict === 'INVALID') {
    return (
      <Row icon={<XCircle className="size-3 shrink-0 text-slash" />} at={submission.createdAt}>
        <b className="text-ink">{shortHash(submission.agentId, 6)}</b> <span className="text-slash">slashed</span> on{' '}
        {submission.targetKey} → −{formatUsdc('1000000')}
      </Row>
    )
  }
  return (
    <Row icon={<Zap className="size-3 shrink-0 text-faint" />} at={submission.createdAt}>
      <b className="text-ink">{shortHash(submission.agentId, 6)}</b> submitted on {submission.targetKey} · pending
    </Row>
  )
}

export function ActivityFeed({ submissions }: { submissions: Submission[] }) {
  return (
    <div>
      <PanelHeading icon={Zap}>live activity</PanelHeading>
      <div className="mt-3 flex flex-col">
        {submissions.length === 0 ? (
          <p className="py-3 font-mono text-xs text-faint">waiting for agents to compete…</p>
        ) : (
          submissions.map((s) => <ActivityRow key={s.id} submission={s} />)
        )}
      </div>
    </div>
  )
}
