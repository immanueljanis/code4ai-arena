type ExploitCall = {
  caller: string
  entryPoint: string
  args: Record<string, unknown>
}

type Agent = {
  id: string
  walletAddress: `0x${string}`
}

type HistoricalExploit = {
  targetKey: string
  incident: string
  technique: string
  lossUsd: string
  attackTx: string
}

type Submission = {
  verdict: 'VALID' | 'INVALID'
  exploitTxHash: string
  settlementTxHash: string
  reputationTxHash: string
}

const api = process.env.CODE4AI_API ?? 'http://localhost:8787'
const target = process.env.TARGET ?? 'reentrancy-vault'
const subgraph = process.env.SUBGRAPH_URL
const placeholder = '0xa11ce00000000000000000000000000000000000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  return body as T
}

async function readTarget(): Promise<{ source: string; objective: string }> {
  return request(`/api/contests/${encodeURIComponent(target)}`)
}

async function readHistory(): Promise<HistoricalExploit[]> {
  if (!subgraph) return []
  const response = await fetch(subgraph, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query ExploitHistory { historicalExploits(first: 10, orderBy: timestamp, orderDirection: desc) { targetKey incident technique lossUsd attackTx } }`,
    }),
  })
  if (!response.ok) return []
  const body = await response.json() as { data?: { historicalExploits?: HistoricalExploit[] } }
  return body.data?.historicalExploits ?? []
}

function fallbackPlan(targetKey: string, wallet: string): ExploitCall[] {
  if (targetKey === 'access-control-vault') {
    return [
      { caller: wallet, entryPoint: 'setOwner', args: { newOwner: wallet } },
      { caller: wallet, entryPoint: 'withdrawAll', args: {} },
    ]
  }
  if (targetKey === 'rounding-vault') {
    const other = '0x000000000000000000000000000000000000b0b0'
    return [
      { caller: wallet, entryPoint: 'deposit', args: {} },
      { caller: wallet, entryPoint: 'donate', args: { amount: 1_000_000 } },
      { caller: other, entryPoint: 'deposit', args: {} },
      { caller: wallet, entryPoint: 'transferShares', args: { to: other, shareCount: 100 } },
      { caller: wallet, entryPoint: 'transferShares', args: { to: other, shareCount: 200 } },
      { caller: wallet, entryPoint: 'withdraw', args: { shareCount: 700 } },
    ]
  }
  if (targetKey === 'reentrancy-vault') {
    return [
      { caller: wallet, entryPoint: 'deposit', args: {} },
      { caller: wallet, entryPoint: 'armSelfReentry', args: {} },
      { caller: wallet, entryPoint: 'withdraw', args: { amount: 1 } },
    ]
  }
  throw new Error(`no reference plan for ${targetKey}`)
}

function parseCalls(text: string): ExploitCall[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('LLM response did not contain a call array')
  return JSON.parse(text.slice(start, end + 1)) as ExploitCall[]
}

const SYSTEM_PROMPT =
  'Return only a JSON array of exploit calls. Every caller and address argument must use the supplied wallet. Do not reveal or infer hidden invariant expressions.'

/** Which API shape the key belongs to. Override with LLM_PROVIDER. */
function provider(key: string): 'openai' | 'anthropic' {
  const explicit = process.env.LLM_PROVIDER
  if (explicit === 'openai' || explicit === 'anthropic') return explicit
  return key.startsWith('sk-ant-') ? 'anthropic' : 'openai'
}

type Plan = { calls: ExploitCall[]; planSource: 'model' | 'builtin' }

async function llmPlan(source: string, objective: string, history: HistoricalExploit[], wallet: string): Promise<Plan> {
  const key = process.env.LLM_API_KEY
  if (!key) return { calls: fallbackPlan(target, wallet), planSource: 'builtin' }

  const brief = JSON.stringify({ target, wallet, objective, source, similarHistoricalExploits: history })
  const kind = provider(key)
  const base =
    process.env.LLM_BASE_URL ??
    (kind === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')
  const model = process.env.LLM_MODEL ?? (kind === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o')

  const request =
    kind === 'anthropic'
      ? {
          url: `${base}/messages`,
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: {
            model,
            max_tokens: 1800,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: brief }],
          },
        }
      : {
          url: `${base}/chat/completions`,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: {
            model,
            max_completion_tokens: 1800,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: brief },
            ],
          },
        }

  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  })
  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}: ${await response.text()}`)
  }
  const body = (await response.json()) as {
    content?: Array<{ text?: string }>
    choices?: Array<{ message?: { content?: string } }>
  }
  const text =
    kind === 'anthropic'
      ? (body.content ?? []).map((part) => part.text ?? '').join('')
      : (body.choices?.[0]?.message?.content ?? '')
  return { calls: parseCalls(text), planSource: 'model' }
}

function normalizeCalls(calls: ExploitCall[], wallet: string): ExploitCall[] {
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string' && value.toLowerCase() === placeholder) return wallet
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]))
    }
    return value
  }
  return calls.map((call) => ({
    caller: wallet,
    entryPoint: call.entryPoint,
    args: replace(call.args) as Record<string, unknown>,
  }))
}

async function main(): Promise<void> {
  const [{ source, objective }, history] = await Promise.all([readTarget(), readHistory()])
  const agent = await request<Agent>('/api/agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: `reference-agent-${Date.now().toString(36)}` }),
  })
  const plan = await llmPlan(source, objective, history, agent.walletAddress)
  const calls = normalizeCalls(plan.calls, agent.walletAddress)
  console.log(JSON.stringify({ event: 'plan', target, planSource: plan.planSource, historyUsed: history.length, exploitCalls: calls }, null, 2))
  // A stable key means a retried submission resumes the same attempt instead of
  // paying a second stake.
  const idempotencyKey = process.env.IDEMPOTENCY_KEY ?? crypto.randomUUID()
  const result = await request<Submission>(`/api/contests/${encodeURIComponent(target)}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ agentId: agent.id, exploitCalls: calls }),
  })
  console.log(JSON.stringify({ target, idempotencyKey, planSource: plan.planSource, historyUsed: history.length, exploitCalls: calls, ...result }, null, 2))
  if (result.verdict !== 'VALID') throw new Error(`reference agent received ${result.verdict}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
