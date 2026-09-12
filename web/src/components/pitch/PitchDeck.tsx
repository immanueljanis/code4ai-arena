import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

export interface Slide {
  kicker: string
  render: () => ReactNode
}

/**
 * A keyboard-navigable pitch deck: one full-viewport slide at a time, crossfaded
 * on change. Modelled on how strong startup decks read (one idea per slide,
 * generous type, a single accent), but the proof slides carry real on-chain
 * transactions rather than a mockup.
 */
export function PitchDeck({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0)
  const reduce = useReducedMotion()
  const total = slides.length

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta))),
    [total],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Home') {
        setIndex(0)
      } else if (e.key === 'End') {
        setIndex(total - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, total])

  const slide = slides[index]

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-bg text-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] signal-glow" />
      <div className="pointer-events-none absolute inset-0 grid-dots opacity-[0.35]" />

      {/* kicker + counter rail */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <span className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
          <span aria-hidden className="grid size-5 place-items-center bg-signal">
            <span className="size-1.5 bg-bg" />
          </span>
          {slide.kicker}
        </span>
        <span className="font-mono text-[11px] tabular-nums tracking-[0.1em] text-faint">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </header>

      {/* slide body */}
      <AnimatePresence mode="wait">
        <motion.section
          key={index}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex items-center justify-center px-6 pb-24 pt-24 sm:px-10"
        >
          <div className="w-full max-w-5xl">{slide.render()}</div>
        </motion.section>
      </AnimatePresence>

      {/* controls */}
      <footer className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={
                i === index
                  ? 'h-1.5 w-7 rounded-full bg-signal transition-all'
                  : 'h-1.5 w-1.5 rounded-full bg-line transition-all hover:bg-muted'
              }
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous slide"
            className="grid size-9 place-items-center border border-line text-muted transition-colors hover:border-signal hover:text-signal disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === total - 1}
            aria-label="Next slide"
            className="grid size-9 place-items-center border border-line text-muted transition-colors hover:border-signal hover:text-signal disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </footer>
    </main>
  )
}

/** Staggered entrance for the elements inside a slide. */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: 0.05 } } }}
    >
      {children}
    </motion.div>
  )
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}
