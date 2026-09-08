/* Pure display formatters — no UI, easily unit-testable. */

const USDC_DECIMALS = 1_000_000n

/** USDC atomic units (6 decimals) → display string, e.g. "5 USDC" or "1.5 USDC". */
export function formatUsdc(amount: string | number | bigint): string {
  const atomic = BigInt(amount)
  const whole = atomic / USDC_DECIMALS
  const frac = atomic % USDC_DECIMALS
  if (frac === 0n) return `${whole} USDC`
  const fracStr = (frac.toString()).padStart(6, '0').replace(/0+$/, '')
  return `${whole}.${fracStr} USDC`
}

export const shortHash = (hash: string, edge = 4): string =>
  hash.length > edge * 2 + 2 ? `${hash.slice(0, edge + 2)}…${hash.slice(-edge)}` : hash

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
