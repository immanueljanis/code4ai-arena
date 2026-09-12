import type { ComponentType, ReactNode } from 'react'
import { Tag, cn } from '../ui'
import type { Verdict } from '../../lib/arena/types'

/* open/closed tag — derived from pool balance on the server side */
export function StatusTag({ open }: { open: boolean }) {
  return open ? (
    <span className="font-mono text-[10px] uppercase tracking-wider text-faint">open</span>
  ) : (
    <span className="font-mono text-[10px] uppercase tracking-wider text-signal">solved</span>
  )
}

export function VerdictLabel({ verdict }: { verdict: Verdict }) {
  return verdict === 'VALID' ? (
    <span className="font-mono text-xs font-bold tracking-widest text-signal">VALID</span>
  ) : (
    <span className="font-mono text-xs font-bold tracking-widest text-slash">INVALID</span>
  )
}

/* small label/value stat used in the top strip */
export function StatTile({ label, value, tone }: { label: string; value: ReactNode; tone?: 'signal' | 'slash' }) {
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-[11px]">
      <span className="text-faint">{label}</span>
      <span className={cn('text-ink', tone === 'signal' && 'text-signal', tone === 'slash' && 'text-slash')}>{value}</span>
    </span>
  )
}

/* side-panel heading: "// label" with an icon */
export function PanelHeading({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted">
      <Icon className="size-3.5 text-signal" />
      <span>{children}</span>
    </h2>
  )
}

/* read-only source viewer */
export function CodeBlock({ title, code, className }: { title: string; code: string; className?: string }) {
  return (
    <div className={cn('border border-line bg-bg-2', className)}>
      <div className="border-b border-line px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-faint">{title}</div>
      <pre className="max-h-80 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted">
        <code>{code}</code>
      </pre>
    </div>
  )
}
