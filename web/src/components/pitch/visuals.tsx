import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/* Count a number up when it mounts. The deck advances one slide at a time, so
   every visual mounts fresh and replays. */
export function Count({
  to,
  suffix = '',
  prefix = '',
  decimals = 0,
  className = '',
}: {
  to: number
  suffix?: string
  prefix?: string
  decimals?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? to : 0)
  const text = useTransform(mv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`)
  useEffect(() => {
    if (reduce) return
    const controls = animate(mv, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1] })
    return controls.stop
  }, [mv, to, reduce])
  return <motion.span className={className}>{text}</motion.span>
}

/* A horizontal bar that grows to `pct` (0..1) on mount. */
export function GrowBar({
  pct,
  label,
  value,
  tone = 'signal',
  delay = 0,
}: {
  pct: number
  label: string
  value: string
  tone?: 'signal' | 'muted'
  delay?: number
}) {
  const reduce = useReducedMotion()
  const color = tone === 'signal' ? 'bg-signal' : 'bg-line'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-muted">{label}</span>
        <span className={tone === 'signal' ? 'font-bold text-signal' : 'text-faint'}>{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden bg-surface">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: reduce ? `${pct * 100}%` : 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay }}
        />
      </div>
    </div>
  )
}

/* A node in a flow diagram; the active one keeps a soft signal pulse. */
export function Node({
  children,
  active = false,
  tone = 'line',
}: {
  children: ReactNode
  active?: boolean
  tone?: 'line' | 'signal' | 'slash'
}) {
  const reduce = useReducedMotion()
  const border =
    tone === 'signal' ? 'border-signal/60' : tone === 'slash' ? 'border-slash/60' : 'border-line'
  const textCls = tone === 'signal' ? 'text-signal' : tone === 'slash' ? 'text-slash' : 'text-muted'
  return (
    <motion.div
      className={`relative shrink-0 border ${border} bg-surface/60 px-4 py-3 text-center font-mono text-xs ${textCls}`}
      animate={
        active && !reduce
          ? { boxShadow: ['0 0 0 0 rgba(251,106,30,0)', '0 0 22px 2px rgba(251,106,30,0.25)', '0 0 0 0 rgba(251,106,30,0)'] }
          : undefined
      }
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

/* A connector between nodes with a dot that travels along it, left to right. */
export function Edge({ vertical = false }: { vertical?: boolean }) {
  const reduce = useReducedMotion()
  if (vertical) {
    return (
      <div className="relative mx-auto h-8 w-px bg-line">
        {!reduce && (
          <motion.span
            className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-signal"
            initial={{ top: 0, opacity: 0 }}
            animate={{ top: ['0%', '100%'], opacity: [0, 1, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    )
  }
  return (
    <div className="relative h-px min-w-8 flex-1 bg-line">
      {!reduce && (
        <motion.span
          className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-signal"
          initial={{ left: 0, opacity: 0 }}
          animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

/* A left-to-right row of nodes joined by travelling edges. */
export function Flow({ steps }: { steps: Array<{ label: string; tone?: 'line' | 'signal' | 'slash'; active?: boolean }> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <Node tone={s.tone} active={s.active}>
            {s.label}
          </Node>
          {i < steps.length - 1 && <Edge />}
        </div>
      ))}
    </div>
  )
}

/* A verdict stamp that presses in, the way a case file gets marked. */
export function Stamp({ text, tone = 'signal' }: { text: string; tone?: 'signal' | 'slash' }) {
  const reduce = useReducedMotion()
  const color = tone === 'signal' ? 'text-signal' : 'text-slash'
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.6, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: -6 }}
      transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.3 }}
      className={`stamp inline-block px-5 py-2 text-2xl ${color}`}
    >
      {text}
    </motion.div>
  )
}

/* Cheap, dependency-free "typing" of a short command line. */
export function Typewriter({ text, className = '' }: { text: string; className?: string }) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? text.length : 0)
  const ref = useRef(text)
  ref.current = text
  useEffect(() => {
    if (reduce) return
    setN(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setN(i)
      if (i >= ref.current.length) clearInterval(id)
    }, 32)
    return () => clearInterval(id)
  }, [text, reduce])
  return (
    <span className={className}>
      {text.slice(0, n)}
      <span className="cursor" />
    </span>
  )
}
