/* The data boundary. The UI depends only on `ArenaClient`; swap the
   implementation (mock now, HTTP against the CODE4AI server) without
   touching components. */

import { SEED_CONTESTS, SEED_STATE } from './fixtures'
import type {
  AgentRegistration,
  Contest,
  ContestDetail,
  ExploitCall,
  PlaygroundResult,
  StateResponse,
  Submission,
  SubmitResult,
} from './types'

export interface ArenaClient {
  listContests(): Promise<Contest[]>
  getContest(key: string): Promise<ContestDetail | null>
  registerAgent(label: string): Promise<AgentRegistration>
  /** Free verification on a local Anvil sandbox — no stake, no settlement. */
  playground(key: string, exploitCalls: ExploitCall[]): Promise<PlaygroundResult>
  /** Real submission — stake auto-funded + signed by the server (custody mode). */
  submit(
    key: string,
    agentId: string,
    exploitCalls: ExploitCall[],
  ): Promise<SubmitResult>
  state(): Promise<StateResponse>
}

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

/* ── Mock client: fully in-memory, drives a believable live demo ────────── */
export class MockArenaClient implements ArenaClient {
  private contests: ContestDetail[]
  private submissions: Submission[] = []
  readonly runDuration = 600

  constructor() {
    this.contests = structuredClone(SEED_CONTESTS)
    this.submissions = structuredClone(SEED_STATE.submissions)
  }

  async listContests() {
    return this.contests.map(stripSource)
  }
  async getContest(key: string) {
    return structuredClone(this.contests.find((c) => c.key === key)) ?? null
  }
  async registerAgent(label: string): Promise<AgentRegistration> {
    return {
      id: uid('agent'),
      label,
      walletAddress: `0x${Math.random().toString(16).slice(2, 42)}`,
      erc8004TokenId: `mock-id:${uid('a')}`,
    }
  }
  async playground(key: string, exploitCalls: ExploitCall[]): Promise<PlaygroundResult> {
    await sleep(this.runDuration)
    // The real judge is invariantHolds(); the mock flips to VALID when the
    // classic access-control sequence (setOwner → withdrawAll) is present.
    const classic =
      exploitCalls.some((c) => c.entryPoint === 'setOwner') &&
      exploitCalls.some((c) => c.entryPoint === 'withdrawAll')
    return { verdict: classic ? 'VALID' : 'INVALID' }
  }
  async submit(
    key: string,
    _agentId: string,
    exploitCalls: ExploitCall[],
  ): Promise<SubmitResult> {
    await sleep(this.runDuration)
    const valid = exploitCalls.some((c) => c.entryPoint === 'setOwner')
    const result: SubmitResult = {
      submissionId: uid('sub'),
      verdict: valid ? 'VALID' : 'INVALID',
      exploitTxHash: `0x${Math.random().toString(16).slice(2, 66)}`,
      settlementTxHash: `0x${Math.random().toString(16).slice(2, 66)}`,
      reputationTxHash: `0x${Math.random().toString(16).slice(2, 66)}`,
    }
    this.submissions = [
      {
        id: result.submissionId,
        agentId: _agentId,
        targetKey: key,
        mode: 'real' as const,
        verdict: result.verdict,
        exploitTxHash: result.exploitTxHash,
        settlementTxHash: result.settlementTxHash,
        reputationTxHash: result.reputationTxHash,
        createdAt: new Date().toISOString(),
      },
      ...this.submissions,
    ].slice(0, 30)
    return result
  }
  async state(): Promise<StateResponse> {
    return {
      submissions: this.submissions,
      targets: this.contests.map(stripSource),
    }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const stripSource = (c: ContestDetail): Contest => {
  const { source: _source, ...rest } = c
  return rest
}

/* ── HTTP client: talks to the CODE4AI server API ───────────────────────── */
export class HttpArenaClient implements ArenaClient {
  constructor(private base: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
    const text = await res.text()
    let body: unknown = undefined
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = text
    }
    if (!res.ok) {
      const msg =
        (body && typeof body === 'object' && 'error' in body
          ? String((body as Record<string, unknown>)['error'])
          : typeof body === 'string'
            ? body
            : '') || `Request failed (${res.status})`
      const err = new Error(msg) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    return body as T
  }

  listContests() {
    return this.request<Contest[]>('/api/contests')
  }
  getContest(key: string) {
    return this.request<ContestDetail>(`/api/contests/${encodeURIComponent(key)}`).catch(
      (e) => {
        if ((e as Error & { status?: number }).status === 404) return null
        throw e
      },
    )
  }
  registerAgent(label: string) {
    return this.request<AgentRegistration>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ label }),
    })
  }
  playground(key: string, exploitCalls: ExploitCall[]) {
    return this.request<PlaygroundResult>(
      `/api/contests/${encodeURIComponent(key)}/playground`,
      { method: 'POST', body: JSON.stringify({ exploitCalls }) },
    )
  }
  submit(key: string, agentId: string, exploitCalls: ExploitCall[]) {
    return this.request<SubmitResult>(`/api/contests/${encodeURIComponent(key)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ agentId, exploitCalls }),
    })
  }
  state() {
    return this.request<StateResponse>('/api/state')
  }
}

/** Pick the implementation: live HTTP if configured, otherwise the in-memory mock. */
export function createArenaClient(): ArenaClient {
  const base = import.meta.env.VITE_API_URL as string | undefined
  return base ? new HttpArenaClient(base) : new MockArenaClient()
}
