import { Ban, XCircle } from 'lucide-react'
import { Marquee } from '../ui'
import { SLOP } from './content'

export function SlopMarquee() {
  return (
    <div className="relative overflow-hidden border-y border-slash/30 bg-slash/[0.03]">
      <div className="flex items-stretch">
        {/* label badge */}
        <div className="z-10 flex shrink-0 items-center gap-2.5 border-r border-slash/30 bg-slash/10 px-5">
          <Ban className="size-4 text-slash" />
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-slash">AI slop · rejected</span>
          <span className="size-1.5 rounded-full bg-slash animate-blink" />
        </div>

        {/* rejected-report ticker */}
        <Marquee className="flex-1 py-3">
          {SLOP.map((report, i) => (
            <span
              key={i}
              className="mx-2.5 inline-flex items-center gap-2 border border-slash/25 bg-bg/60 px-3 py-1.5 font-mono text-xs text-muted"
            >
              <XCircle className="size-3.5 shrink-0 text-slash" />
              <span className="whitespace-nowrap line-through decoration-slash/60">{report}</span>
            </span>
          ))}
        </Marquee>
      </div>

      {/* fade the ticker into the page on the right */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-bg to-transparent" />
    </div>
  )
}
