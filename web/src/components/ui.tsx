import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useInView, useMotionValue, useSpring, type Variants } from 'motion/react'
import { Link } from '@tanstack/react-router'
import { SETTLEMENT_PROFILE, SETTLEMENT_SYMBOL } from '../lib/arena/format'

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/** shared page container width */
export const wrap = 'mx-auto w-full max-w-6xl px-6'

/* ── Corner brackets (Arbital-style; sharp, no rounding) — shared by Card + Button ── */
export function Corners({ tone = 'line', size = 'size-2.5', hover = false }: { tone?: 'line' | 'lime' | 'slash'; size?: string; hover?: boolean }) {
  const bc = tone === 'lime' ? 'border-lime' : tone === 'slash' ? 'border-slash' : 'border-faint'
  // on an interactive Card, line-tone brackets light up lime and grow on hover
  const hoverCls = hover && tone === 'line' ? 'transition-all duration-300 group-hover/card:border-lime group-hover/card:size-4' : ''
  const k = cn('pointer-events-none absolute z-10', size, hoverCls)
  return (
    <>
      <span className={cn(k, '-left-px -top-px border-l-2 border-t-2', bc)} />
      <span className={cn(k, '-right-px -top-px border-r-2 border-t-2', bc)} />
      <span className={cn(k, '-bottom-px -left-px border-b-2 border-l-2', bc)} />
      <span className={cn(k, '-bottom-px -right-px border-b-2 border-r-2', bc)} />
    </>
  )
}

/* ── Button — sharp + bracket corners. Pass `to` for client-side routing, `href` for plain links. ── */
export function Button({
  children,
  variant = 'primary',
  className,
  as = 'a',
  href = '#',
  to,
  ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'light' | 'outline' | 'ghost'
  className?: string
  as?: 'a' | 'button'
  href?: string
  to?: string
} & Record<string, unknown>) {
  const base =
    'group relative inline-flex items-center justify-center gap-2 px-5 py-2.5 font-mono text-sm font-medium transition-colors duration-200'
  const map = {
    primary: { cls: 'bg-lime/10 text-lime hover:bg-lime/20', tone: 'lime' as const },
    light: { cls: 'bg-ink text-bg hover:bg-white', tone: null },
    outline: { cls: 'bg-surface/40 text-ink hover:bg-surface', tone: 'line' as const },
    ghost: { cls: 'text-muted hover:text-ink', tone: null },
  }[variant]
  const cls = cn(base, map.cls, className)
  const inner = (
    <>
      {map.tone && <Corners tone={map.tone} size="size-2" />}
      {children}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {inner}
      </Link>
    )
  }
  const Comp: any = as
  return (
    <Comp href={as === 'a' ? href : undefined} className={cls} {...rest}>
      {inner}
    </Comp>
  )
}

/* ── Skeleton — loading placeholder ── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse border border-line/50 bg-surface/40', className)} aria-hidden />
}

/* ── Section label — mono eyebrow ── */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted">{children}</span>
}

/* ── Mono tag chip ── */
export function Tag({ children, tone = 'line' }: { children: ReactNode; tone?: 'line' | 'lime' | 'slash' }) {
  const c = {
    line: 'text-muted hairline',
    lime: 'text-lime ring-1 ring-lime/30 bg-lime/5',
    slash: 'text-slash ring-1 ring-slash/30 bg-slash/5',
  }[tone]
  return <span className={cn('inline-flex items-center px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider', c)}>{children}</span>
}

export function TestTokenBadge() {
  if (SETTLEMENT_PROFILE !== 'demo-hts') return null
  return <Tag tone="slash">{SETTLEMENT_SYMBOL} · test token, not USD</Tag>
}

/**
 * The server decides which token actually settles. When the build-time profile
 * disagrees, say so loudly: silently labelling DemoUSD as USDC would misstate
 * what an agent is being paid in.
 */
export function SettlementMismatch({ serverSymbol }: { serverSymbol?: string }) {
  if (!serverSymbol || serverSymbol === SETTLEMENT_SYMBOL) return null
  return (
    <Tag tone="slash">
      settles in {serverSymbol}, not {SETTLEMENT_SYMBOL} — rebuild the UI
    </Tag>
  )
}

/* ── Corner-bracket frame (Arbital crosshair markers) ── */
export function Bracket({ children, className, tone = 'line' }: { children: ReactNode; className?: string; tone?: 'line' | 'lime' }) {
  const c = tone === 'lime' ? 'border-lime/60' : 'border-line'
  const k = 'pointer-events-none absolute size-2.5'
  return (
    <div className={cn('relative', className)}>
      <span className={cn(k, 'left-0 top-0 border-l border-t', c)} />
      <span className={cn(k, 'right-0 top-0 border-r border-t', c)} />
      <span className={cn(k, 'bottom-0 left-0 border-b border-l', c)} />
      <span className={cn(k, 'bottom-0 right-0 border-b border-r', c)} />
      {children}
    </div>
  )
}

/* ── Card — the consistent surface: rounded border + bracket corners (refs 13/14) ── */
export function Card({
  children,
  className,
  tone = 'line',
  interactive = false,
}: {
  children: ReactNode
  className?: string
  tone?: 'line' | 'lime' | 'slash'
  /** enables the hover animation (lift + lime border + glow + brackets light up) */
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'group/card relative border border-line/60 bg-surface/40 transition-all duration-300',
        interactive && 'hover:-translate-y-1 hover:border-lime/40 hover:bg-surface hover:shadow-[0_16px_44px_-18px_rgba(180,230,50,0.35)]',
        className,
      )}
    >
      <Corners tone={tone} size="size-3.5" hover={interactive} />
      {children}
    </div>
  )
}

/* ── Reveal on scroll ── */
const v: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }
export function Reveal({
  children,
  delay = 0,
  className,
  immediate = false,
}: {
  children: ReactNode
  delay?: number
  className?: string
  /** animate on mount instead of waiting for the in-view observer (use for above-the-fold content) */
  immediate?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-12% 0px' })
  return (
    <motion.div
      ref={ref}
      variants={v}
      initial="hidden"
      animate={immediate || inView ? 'show' : 'hidden'}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ── Animated counter (mono lime) ── */
export function Counter({ to, prefix = '', suffix = '', decimals = 0, className }: { to: number; prefix?: string; suffix?: string; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { duration: 1500, bounce: 0 })
  const [val, setVal] = useState('0')
  useEffect(() => { if (inView) mv.set(to) }, [inView, to, mv])
  useEffect(() => spring.on('change', (x) => setVal(x.toFixed(decimals))), [spring, decimals])
  return <span ref={ref} className={className}>{prefix}{val}{suffix}</span>
}

/* ── Marquee ── */
export function Marquee({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('group flex overflow-hidden', className)}>
      <div className="flex shrink-0 animate-marquee items-center group-hover:[animation-play-state:paused]">{children}{children}</div>
    </div>
  )
}
