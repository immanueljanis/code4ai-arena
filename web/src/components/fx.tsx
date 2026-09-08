import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useInView, useMotionValue, useScroll, useSpring } from 'motion/react'
import { cn } from './ui'

/* ── Flickering grid background (magicui-style, canvas, on-theme) ── */
function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}
export function FlickeringGrid({
  className,
  squareSize = 3,
  gridGap = 8,
  color = '#836ef9',
  maxOpacity = 0.16,
  flickerChance = 0.18,
}: {
  className?: string
  squareSize?: number
  gridGap?: number
  color?: string
  maxOpacity?: number
  flickerChance?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!mounted) return
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    const rgb = hexToRgb(color)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let cols = 0
    let rows = 0
    let sq = new Float32Array(0)
    let raf = 0
    const step = squareSize + gridGap
    const setup = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      cols = Math.ceil(w / step)
      rows = Math.ceil(h / step)
      sq = new Float32Array(cols * rows)
      for (let i = 0; i < sq.length; i++) sq[i] = Math.random() * maxOpacity
    }
    setup()
    const ro = new ResizeObserver(setup)
    ro.observe(wrap)
    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const i = c * rows + r
          if (Math.random() < flickerChance * dt * 60) sq[i] = Math.random() * maxOpacity
          const o = sq[i] ?? 0
          if (o > 0.02) {
            ctx.fillStyle = `rgba(${rgb},${o})`
            ctx.fillRect(c * step * dpr, r * step * dpr, squareSize * dpr, squareSize * dpr)
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mounted, squareSize, gridGap, color, maxOpacity, flickerChance])
  return (
    <div ref={wrapRef} className={className}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

/* ── Scroll progress bar (top, lime) ── */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return <motion.div style={{ scaleX: x }} className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-lime" />
}

/* ── Decrypt / scramble-in text (reactbits-style, hacker) ── */
const GLYPHS = '!<>-_\\/[]{}=+*^?#________01x402'
export function DecryptText({ text, className, as: As = 'span' as any }: { text: string; className?: string; as?: any }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-8% 0px' })
  const [display, setDisplay] = useState(text) // SSR + pre-anim shows final text
  const ran = useRef(false)
  useEffect(() => {
    if (!inView || ran.current) return
    ran.current = true
    let frame = 0
    const id = setInterval(() => {
      frame++
      const revealed = Math.floor(frame / 2)
      setDisplay(
        text
          .split('')
          .map((ch, i) => (ch === ' ' ? ' ' : i < revealed ? text[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(''),
      )
      if (revealed >= text.length) {
        clearInterval(id)
        setDisplay(text)
      }
    }, 28)
    return () => clearInterval(id)
  }, [inView, text])
  return (
    <As ref={ref} className={className}>
      {display}
    </As>
  )
}

/* ── Magnetic wrapper (subtle cursor follow) ── */
export function Magnetic({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 200, damping: 15 })
  const sy = useSpring(y, { stiffness: 200, damping: 15 })
  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      className="inline-block"
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        x.set((e.clientX - (r.left + r.width / 2)) * strength)
        y.set((e.clientY - (r.top + r.height / 2)) * strength)
      }}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

/* ── Terminal that types itself in + one-shot scanline ── */
export type TermLine = { c: 'comment' | 'cmd' | 'cont' | 'out' | 'ok'; t: string }
export function TerminalReveal({ lines, className }: { lines: TermLine[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* scanline sweep */}
      {inView && (
        <motion.div
          initial={{ y: 0, opacity: 0.5 }}
          animate={{ y: '100%', opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-lime/15 to-transparent"
        />
      )}
      <motion.div initial="hidden" animate={inView ? 'show' : 'hidden'} variants={{ show: { transition: { staggerChildren: 0.13 } } }} className="space-y-1">
        {lines.map((l, i) => (
          <motion.div key={i} variants={{ hidden: { opacity: 0, x: -4 }, show: { opacity: 1, x: 0 } }} className="whitespace-pre">
            {l.c === 'comment' && <span className="text-faint">{l.t}</span>}
            {l.c === 'cmd' && (
              <span>
                <span className="text-lime">$ </span>
                <span className="text-ink">{l.t}</span>
              </span>
            )}
            {l.c === 'cont' && <span className="text-ink">{l.t}</span>}
            {l.c === 'out' && <span className="text-muted">  {l.t}</span>}
            {l.c === 'ok' && <span className="text-lime">{l.t}</span>}
          </motion.div>
        ))}
        <div className="text-lime cursor" />
      </motion.div>
    </div>
  )
}
