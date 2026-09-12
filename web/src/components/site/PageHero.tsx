import type { ReactNode } from 'react'
import { cn, wrap } from '../ui'

/** Reusable page header: eyebrow + title (+ signal accent) + subtitle + optional slot. */
export function PageHero({
  eyebrow,
  title,
  accent,
  subtitle,
  children,
}: {
  eyebrow: string
  title: string
  accent?: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden border-b border-line pt-32 pb-14 sm:pt-36">
      <div className="pointer-events-none absolute inset-0 grid-dots opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 signal-glow" />
      <div className={cn(wrap, 'relative')}>
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-signal">{eyebrow}</span>
        <h1 className="mt-4 max-w-3xl font-mono text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-balance sm:text-6xl">
          {title}
          {accent && (
            <>
              {' '}
              <span className="text-signal">{accent}</span>
            </>
          )}
        </h1>
        {subtitle && <p className="mt-5 max-w-xl leading-relaxed text-muted">{subtitle}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  )
}
