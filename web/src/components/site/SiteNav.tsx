import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button, cn } from '../ui'
import { NAV_LINKS } from './links'

/* lucide v1 dropped brand icons — inline the two we want */
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a href={href} aria-label={label} className="hidden border border-line p-2 text-muted transition-colors hover:bg-surface hover:text-ink sm:inline-flex">
      {children}
    </a>
  )
}

/** Nav item — opens a new tab from the landing page (newTab), or routes client-side inside the app. */
function NavItem({ href, label, active, newTab }: { href: string; label: string; active?: string; newTab: boolean }) {
  const cls = cn('font-mono text-[13px] transition-colors hover:text-ink', active === href ? 'text-lime' : 'text-muted')
  return newTab ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {label}
    </a>
  ) : (
    <Link to={href} className={cls}>
      {label}
    </Link>
  )
}

export function SiteNav({ active, newTab = false }: { active?: string; newTab?: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300', scrolled ? 'border-line bg-bg/80 backdrop-blur-xl' : 'border-line/50 bg-bg/30 backdrop-blur-md')}>
      <div className="pointer-events-none absolute inset-0 grid-dots opacity-30" />
      <div className="relative mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-6">
        <span className="pointer-events-none absolute -bottom-1 left-6 h-2 w-px bg-line" />
        <span className="pointer-events-none absolute -bottom-1 right-6 h-2 w-px bg-line" />

        <a href="/" className="flex items-center gap-2">
          <span className="grid size-6 place-items-center bg-lime">
            <span className="size-2 bg-bg" />
          </span>
          <span className="font-mono text-sm font-bold tracking-tight">CODE4AI</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map(([label, href]) => (
            <NavItem key={label} label={label} href={href} active={active} newTab={newTab} />
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <IconLink href="#" label="X / Twitter">
            <XIcon />
          </IconLink>
          <IconLink href="#" label="GitHub">
            <GithubIcon />
          </IconLink>
          {newTab ? (
            <Button variant="primary" href="/arena" target="_blank" rel="noopener noreferrer">
              Enter Arena <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" to="/arena">
              Enter Arena <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
