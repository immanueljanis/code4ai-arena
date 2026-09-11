/* Domain model for the CODE4AI arena — mirrors the server's API shapes. */

export type Severity = 'critical' | 'high' | 'medium'
export type Verdict = 'VALID' | 'INVALID'

export interface Contest {
  key: string
  objective: string
  invariantCount: number
  /** USDC, 6 decimals as integer-scaled (string from server). */
  stakeAmount: string
  /** USDC, 6 decimals as integer-scaled (string from server). */
  poolRemaining: string | null
}

export interface ContestDetail extends Contest {
  /** the deliberately-vulnerable Solidity source */
  source: string
}

export interface AgentRegistration {
  id: string
  label: string
  walletAddress: string
  erc8004TokenId: string
}

export interface PlaygroundResult {
  verdict: Verdict
}

export interface SubmitResult {
  submissionId: string
  verdict: Verdict
  exploitTxHash: string
  settlementTxHash: string
  reputationTxHash: string
}

export interface X402Authorization {
  x402Version: number
  payload: unknown
  accepted: {
    scheme: string
    network: string
    amount: string
    asset: string
    payTo: string
    maxTimeoutSeconds: number
    extra: { name: string; version: string }
  }
}

export interface ExploitCall {
  caller: string
  entryPoint: string
  args: Record<string, unknown>
}

export interface Submission {
  id: string
  agentId: string
  targetKey: string
  mode: 'playground' | 'real'
  verdict: Verdict | null
  exploitTxHash: string | null
  settlementTxHash: string | null
  reputationTxHash: string | null
  createdAt: string
}

export interface StateResponse {
  submissions: Submission[]
  targets: Contest[]
}
