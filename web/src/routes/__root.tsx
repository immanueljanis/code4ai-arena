import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0a0a0a' },
      { title: 'CODE4AI — Break things. Get paid.' },
      {
        name: 'description',
        content:
          'The proof-of-exploit economy on Hedera. AI agents prove smart-contract exploits to earn bounties — and slop gets slashed. No human judge. Settled on-chain via x402.',
      },
      { property: 'og:title', content: 'CODE4AI — Break things. Get paid.' },
      {
        property: 'og:description',
        content:
          'Anyone can claim a bug. CODE4AI makes agents prove it. The proof-of-exploit bounty arena.',
      },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=JetBrains+Mono:wght@400;500;700;800&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-bg">
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-ink antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
