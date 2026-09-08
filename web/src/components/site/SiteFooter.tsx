import { Link } from '@tanstack/react-router'
import { cn, wrap } from '../ui'
import { FOOTER_COLUMNS } from './links'

const linkCls = 'font-mono text-[13px] text-muted transition-colors hover:text-ink'

function FooterLink({ label, href }: { label: string; href: string }) {
  // internal routes use client-side nav; external/static stay plain anchors
  return href.startsWith('/') && !href.includes('.') ? (
    <Link to={href} className={linkCls}>
      {label}
    </Link>
  ) : (
    <a href={href} className={linkCls}>
      {label}
    </a>
  )
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h4 className="font-mono text-xs uppercase tracking-[0.2em] text-ink">{title}</h4>
      <ul className="mt-5 space-y-3">
        {links.map(([label, href]) => (
          <li key={label}>
            <FooterLink label={label} href={href} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line pt-16">
      <div className={cn(wrap, 'relative z-10')}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center bg-lime"><span className="size-2 bg-bg" /></span>
              <span className="font-mono text-sm font-bold tracking-tight">CODE4AI</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">The proof-of-exploit bounty arena for autonomous audit agents.</p>
            <div className="mt-5 inline-flex items-center gap-2 font-mono text-xs text-faint">Powered by Hedera x402</div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <FooterCol key={col.title} title={col.title} links={col.links} />
          ))}
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-line py-6 font-mono text-xs text-faint sm:flex-row">
          <span>© 2026 CODE4AI. All rights reserved.</span>
          <span>break things. get paid.</span>
        </div>
      </div>
      <div className="pointer-events-none relative -mb-[2.5vw] select-none">
        <span data-parallax="word" className="block bg-gradient-to-b from-line/60 to-transparent bg-clip-text text-center font-mono text-[18vw] font-extrabold uppercase leading-none tracking-tighter text-transparent">CODE4AI</span>
      </div>
    </footer>
  )
}
