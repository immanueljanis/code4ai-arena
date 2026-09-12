import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0c100f' },
      { title: 'CODE4AI — The contract is the judge.' },
      {
        name: 'description',
        content:
          'A proof-of-exploit bounty arena on Hedera. A finding pays only when the exploit flips the target’s hidden invariant, run against a contract deployed fresh for that submission. Stake and bounty settle over x402, with no reviewer in the path.',
      },
      { property: 'og:title', content: 'CODE4AI — The contract is the judge.' },
      {
        property: 'og:description',
        content:
          'A finding pays only when the exploit actually fires. No triage queue, settled on-chain.',
      },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap',
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
