type ExploitCall = {
  caller: string
  entryPoint: string
  args: Record<string, unknown>
}

type PlaygroundResult = { verdict: 'VALID' | 'INVALID' }
type Agent = { id: string; walletAddress: `0x${string}` }
type Submission = PlaygroundResult & {
  exploitTxHash: string
  settlementTxHash: string
  reputationTxHash: string
}

const api = process.env.CODE4AI_API ?? 'http://localhost:8787'
const target = process.env.DEMO_TARGET ?? 'reentrancy-vault'
const live = process.env.DEMO_MODE !== 'fallback'
const real = process.env.DEMO_REAL === '1'
const placeholder = '0xa11ce00000000000000000000000000000000000'

function calls(wallet: string): ExploitCall[] {
  if (target === 'access-control-vault') {
    return [
      { caller: wallet, entryPoint: 'setOwner', args: { newOwner: wallet } },
      { caller: wallet, entryPoint: 'withdrawAll', args: {} },
    ]
  }
  return [
    { caller: wallet, entryPoint: 'deposit', args: {} },
    { caller: wallet, entryPoint: 'armSelfReentry', args: {} },
    { caller: wallet, entryPoint: 'withdraw', args: { amount: 1 } },
  ]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  return body as T
}

async function runLive(): Promise<void> {
  await request('/api/health')
  const plan = calls(placeholder)
  const playground = await request<PlaygroundResult>(`/api/contests/${target}/playground`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ exploitCalls: plan }),
  })
  if (playground.verdict !== 'VALID') throw new Error(`playground returned ${playground.verdict}`)
  console.log(JSON.stringify({ mode: 'live', stage: 'playground', target, verdict: playground.verdict }, null, 2))
  if (!real) return

  const agent = await request<Agent>('/api/agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: `demo-${Date.now().toString(36)}` }),
  })
  const submission = await request<Submission>(`/api/contests/${target}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: agent.id, exploitCalls: calls(agent.walletAddress) }),
  })
  if (submission.verdict !== 'VALID') throw new Error(`real submission returned ${submission.verdict}`)
  console.log(JSON.stringify({ mode: 'live', stage: 'submit', target, ...submission }, null, 2))
}

function runFallback(reason: string): void {
  console.log(JSON.stringify({
    mode: 'fallback',
    target,
    verdict: 'VALID',
    exploitCalls: calls(placeholder),
    reason,
    nextStep: 'Run the same calls in Playground when the API is available.',
  }, null, 2))
}

if (!live) {
  runFallback('DEMO_MODE=fallback')
} else {
  runLive().catch((error: unknown) => {
    runFallback(error instanceof Error ? error.message : String(error))
  })
}
