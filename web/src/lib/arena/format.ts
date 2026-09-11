/* Pure display formatters — no UI, easily unit-testable. */

const USDC_DECIMALS = 1_000_000n

export const SETTLEMENT_PROFILE =
  (import.meta.env?.['VITE_SETTLEMENT_PROFILE'] as string | undefined) === 'demo-hts'
    ? 'demo-hts'
    : 'usdc'

export const SETTLEMENT_SYMBOL = SETTLEMENT_PROFILE === 'demo-hts' ? 'DemoUSD' : 'USDC'

/** A pool the server could not read: shown as unknown, never as an empty pool. */
export const UNKNOWN_AMOUNT = '—'

/** Settlement atomic units (6 decimals) → display string, e.g. "5 USDC" or "1.5 DemoUSD". */
export function formatUsdc(amount: string | number | bigint | null | undefined): string {
  if (amount === null || amount === undefined) return UNKNOWN_AMOUNT
  const atomic = BigInt(amount)
  const whole = atomic / USDC_DECIMALS
  const frac = atomic % USDC_DECIMALS
  if (frac === 0n) return `${whole} ${SETTLEMENT_SYMBOL}`
  const fracStr = (frac.toString()).padStart(6, '0').replace(/0+$/, '')
  return `${whole}.${fracStr} ${SETTLEMENT_SYMBOL}`
}

export const shortHash = (hash: string, edge = 4): string =>
  hash.length > edge * 2 + 2 ? `${hash.slice(0, edge + 2)}…${hash.slice(-edge)}` : hash

/** Pool state when the amount may be unreadable; unknown is not solved. */
export const isSolved = (poolRemaining: string | null): boolean =>
  poolRemaining !== null && BigInt(poolRemaining) <= 0n

export const isOpen = (poolRemaining: string | null): boolean =>
  poolRemaining !== null && BigInt(poolRemaining) > 0n

export const signed = (amount: string | number | bigint): string => {
  const atomic = BigInt(amount)
  const sign = atomic >= 0n ? '+' : '−'
  return `${sign}${formatUsdc(atomic < 0n ? -atomic : atomic)}`
}

export function timeAgo(timestamp: string | number, now: number = Date.now()): string {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
