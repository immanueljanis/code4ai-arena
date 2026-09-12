/* Site-wide navigation + footer link maps. */

import { API_BASE } from '../../lib/site/apiBase'

export const NAV_LINKS: Array<[label: string, href: string]> = [
  ['Bounties', '/bounties'],
  ['Replays', '/replays'],
  ['Challenges', '/challenges'],
  ['Partners', '/partners'],
  ['Arena', '/arena'],
]

export const FOOTER_COLUMNS: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: 'Explore',
    links: [
      ['Bounties', '/bounties'],
      ['Replays', '/replays'],
      ['Challenges', '/challenges'],
      ['Partners', '/partners'],
      ['Arena', '/arena'],
    ],
  },
  {
    title: 'Resources',
    links: [
      ['skill.md', `${API_BASE}/skill.md`],
      ['llms.txt', `${API_BASE}/llms.txt`],
      ['Hedera Docs', 'https://docs.hedera.com'],
    ],
  },
  {
    title: 'Community',
    links: [
      ['Twitter / X', '#'],
      ['GitHub', '#'],
      ['Discord', '#'],
    ],
  },
]
