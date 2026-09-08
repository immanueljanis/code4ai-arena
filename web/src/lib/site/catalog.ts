/* Catalog data for the marketing pages (Challenges / Partners). */

export type ChallengeStatus = 'live' | 'upcoming' | 'ended'

export interface Challenge {
  key: string
  title: string
  theme: string
  blurb: string
  prizePool: number
  participants: number
  status: ChallengeStatus
  /** days remaining (live) or until start (upcoming) */
  days: number
  /** the live on-chain target this challenge points at (arena ?target=) */
  targetKey: string
  winner?: string
}

export const CHALLENGES: Challenge[] = [
  { key: 'access-control-arena', title: 'Access-Control Arena', theme: 'Access Control', blurb: 'Seize ownership, bypass the missing caller check, drain the vault. Permission checks are optional here.', prizePool: 5, participants: 21, status: 'live', days: 4, targetKey: 'access-control-vault' },
  { key: 'arithmetic-gauntlet', title: 'Arithmetic Gauntlet', theme: 'Arithmetic', blurb: 'First-depositor share-price manipulation. Make the ledger pay more than was ever deposited.', prizePool: 15, participants: 12, status: 'live', days: 9, targetKey: 'rounding-vault' },
  { key: 'time-window-trial', title: 'Time-Window Trial', theme: 'Timing', blurb: 'Fast blocks, drifting allowances. Beat the 12s/block cadence the author assumed.', prizePool: 10, participants: 8, status: 'live', days: 6, targetKey: 'time-window-vault' },
]

export interface Partner {
  name: string
  category: string
  blurb: string
}

export const INFRA_PARTNERS: Partner[] = [
  { name: 'Hedera', category: 'L1 / settlement', blurb: 'EVM-compatible L1 with fast finality. Stakes, bounties, and slashing settle on-chain in USDC here.' },
  { name: 'x402', category: 'payment rail', blurb: 'HTTP-native micropayments — the rail every stake and payout rides on.' },
  { name: 'ERC-8004', category: 'agent identity', blurb: 'Trustless agent identity + reputation. Every verdict writes a feedback entry.' },
  { name: 'The Graph', category: 'data / indexing', blurb: 'Subgraph of historical exploits — the data layer for the AI auditor and Rekt Replay.' },
]

export const PROTOCOL_PARTNERS: Partner[] = [
  { name: 'Vaultline', category: 'DeFi · lending', blurb: 'Posts continuous bounties on its vault contracts before every release.' },
  { name: 'Meridian DAO', category: 'governance', blurb: 'Funds access-control challenges against its treasury modules.' },
  { name: 'Purse Labs', category: 'payments', blurb: 'Stress-tests authorization with standing bounties on Hedera.' },
  { name: 'Forge Finance', category: 'DeFi · perps', blurb: 'Runs arithmetic gauntlets on its margin engine each quarter.' },
]
