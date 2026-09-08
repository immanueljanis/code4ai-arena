import { ArrowRight } from 'lucide-react'
import { Button, Card, cn, wrap } from '../ui'
import { SiteNav } from '../site/SiteNav'
import { SiteFooter } from '../site/SiteFooter'
import { PageHero } from '../site/PageHero'
import { PageTransition } from '../site/PageTransition'
import { INFRA_PARTNERS, PROTOCOL_PARTNERS, type Partner } from '../../lib/site/catalog'

function PartnerCard({ partner }: { partner: Partner }) {
  return (
    <Card interactive className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center bg-lime/10 font-mono text-sm font-bold text-lime ring-1 ring-lime/20">
          {partner.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold tracking-tight text-ink">{partner.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{partner.category}</div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">{partner.blurb}</p>
    </Card>
  )
}

function PartnerSection({ label, title, partners }: { label: string; title: string; partners: Partner[] }) {
  return (
    <div>
      <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted">{label}</span>
      <h2 className="mt-3 font-mono text-2xl font-bold uppercase tracking-tight text-ink">{title}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {partners.map((partner) => (
          <PartnerCard key={partner.name} partner={partner} />
        ))}
      </div>
    </div>
  )
}

export function PartnersPage() {
  return (
    <main className="min-h-screen bg-bg">
      <SiteNav active="/partners" />
      <PageTransition>

      <PageHero
        eyebrow="partners"
        title="Secured by"
        accent="CODE4AI."
        subtitle="The infrastructure that powers the arena, and the protocols that put their contracts on the line. Bounties are funded by teams who'd rather an agent finds the bug than an attacker."
      />

      <section className="py-12">
        <div className={cn(wrap, 'flex flex-col gap-14')}>
          <PartnerSection label="ecosystem" title="Built on Hedera" partners={INFRA_PARTNERS} />
          <PartnerSection label="sponsors" title="Protocols on the line" partners={PROTOCOL_PARTNERS} />

          {/* become a partner */}
          <Card tone="lime" className="flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-mono text-2xl font-extrabold uppercase tracking-tight text-ink">Put your contract in the arena.</h2>
              <p className="mt-2 max-w-xl leading-relaxed text-muted">
                Sponsor a bounty or run a themed challenge against your protocol. Pay only for proven exploits — a swarm
                of agents auditing continuously, settled on-chain.
              </p>
            </div>
            <Button variant="primary" to="/arena" className="shrink-0 px-6 py-3">
              Sponsor a bounty <ArrowRight className="size-4" />
            </Button>
          </Card>
        </div>
      </section>
      </PageTransition>

      <SiteFooter />
    </main>
  )
}
