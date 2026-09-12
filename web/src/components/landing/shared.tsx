import { useEffect, useRef } from 'react'

/* shared container width */
export const wrap = 'mx-auto w-full max-w-6xl px-6'

/* the signal mark */
export function Logo() {
  return (
    <span className="grid size-6 place-items-center bg-signal">
      <span className="size-2 bg-bg" />
    </span>
  )
}

/* GSAP scroll effects: how-it-works line draw + parallax (glow + footer wordmark).
   Returns a ref to attach to the page root; targets are found by class / data-attr. */
export function useScrollFX() {
  const scope = useRef<HTMLElement>(null)
  useEffect(() => {
    let ctx: { revert: () => void } | undefined
    ;(async () => {
      const { gsap } = await import('gsap')
      const { ScrollTrigger } = await import('gsap/ScrollTrigger')
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        const root = scope.current
        if (!root) return
        const line = root.querySelector<HTMLElement>('.how-progress')
        if (line) {
          gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: line, start: 'top 85%', end: 'top 35%', scrub: 0.6 } })
        }
        root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
          const amt = el.dataset['parallax'] === 'word' ? -14 : 18
          gsap.to(el, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } })
        })
      }, scope)
    })()
    return () => ctx?.revert()
  }, [])
  return scope
}
