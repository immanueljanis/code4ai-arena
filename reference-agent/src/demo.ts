import {
  api,
  target,
  request,
  readTarget,
  readHistory,
  llmPlan,
  normalizeCalls,
  type Agent,
  type Submission,
} from './index.ts'

/**
 * A paced, film-friendly run of the full autonomous loop, for the demo video.
 * It is the same path the reference agent uses; only the output is dressed up
 * and slowed down so each phase is legible on screen. Set DEMO_PACE_MS to
 * change the beat (0 for no pauses).
 */

const PACE = Number(process.env.DEMO_PACE_MS ?? '1400')
const HASHSCAN = 'https://hashscan.io/testnet'
const C = {
  signal: '\x1b[38;5;208m',
  ink: '\x1b[97m',
  faint: '\x1b[90m',
  green: '\x1b[38;5;42m',
  red: '\x1b[38;5;203m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const line = () => console.log(`${C.faint}${'─'.repeat(64)}${C.reset}`)

async function phase(n: number, title: string): Promise<void> {
  console.log()
  console.log(`${C.signal}${C.bold}  ${n}/4  ${title.toUpperCase()}${C.reset}`)
  line()
  await sleep(PACE * 0.5)
}

const hashscanTx = (id: string) => `${HASHSCAN}/transaction/${id.replace('@', '-').replace('.', '-')}`

async function main(): Promise<void> {
  console.clear?.()
  console.log()
  console.log(`${C.signal}${C.bold}  ▪ code4ai${C.reset}  ${C.faint}the contract is the judge${C.reset}`)
  console.log(`${C.faint}  an autonomous auditor, end to end, on Hedera testnet${C.reset}`)
  console.log(`${C.faint}  target: ${C.reset}${C.ink}${target}${C.reset}`)
  await sleep(PACE)

  // 1 — read the target and the history
  await phase(1, 'read the target + historical exploits')
  const [{ source, objective }, history] = await Promise.all([readTarget(), readHistory()])
  console.log(`  ${C.ink}objective${C.reset}  ${objective}`)
  console.log(`  ${C.ink}source${C.reset}     ${source.split('\n').length} lines of Solidity, invariant hidden`)
  await sleep(PACE * 0.6)
  console.log(`  ${C.faint}similar hacks indexed from Ethereum mainnet (The Graph):${C.reset}`)
  for (const h of history) {
    console.log(`    ${C.signal}•${C.reset} ${h.incident.padEnd(16)} ${C.faint}${h.technique}${C.reset}`)
    await sleep(PACE * 0.25)
  }
  await sleep(PACE * 0.6)

  // 2 — register + plan with the LLM
  await phase(2, 'register + plan the exploit')
  const agent = await request<Agent>('/api/agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: `demo-${Date.now().toString(36)}` }),
  })
  console.log(`  ${C.ink}agent${C.reset}   ${agent.walletAddress}`)
  console.log(`  ${C.faint}planning...${C.reset}`)
  const plan = await llmPlan(source, objective, history, agent.walletAddress)
  const calls = normalizeCalls(plan.calls, agent.walletAddress)
  const planned = plan.planSource === 'model' ? `${C.green}planned by the model${C.reset}` : `${C.faint}built-in fallback plan${C.reset}`
  console.log(`  ${planned}`)
  for (const c of calls) {
    const args = Object.keys(c.args).length ? ` ${C.faint}${JSON.stringify(c.args)}${C.reset}` : ''
    console.log(`    ${C.signal}→${C.reset} ${c.entryPoint}${args}`)
    await sleep(PACE * 0.3)
  }
  await sleep(PACE * 0.6)

  // A rehearsal stops here: phases 1-2 make no on-chain move and never claim a
  // bounty, so they can be replayed as many times as you like before the take.
  if (process.env.DEMO_DRY) {
    console.log()
    console.log(`  ${C.faint}dry run — stopping before the on-chain stake. unset DEMO_DRY for the real take.${C.reset}`)
    console.log()
    return
  }

  // 3 — stake, prove, settle (the server provisions, funds, proves, settles)
  await phase(3, 'stake · prove on a fresh target · settle')
  console.log(`  ${C.faint}staking over x402, deploying a fresh target, replaying the exploit...${C.reset}`)
  const started = Date.now()
  // A stable key lets a timed-out run resume the same attempt instead of
  // re-staking or burning the pool — set IDEMPOTENCY_KEY before a live take.
  const idempotencyKey = process.env.IDEMPOTENCY_KEY ?? crypto.randomUUID()
  const result = await request<Submission>(`/api/contests/${encodeURIComponent(target)}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ agentId: agent.id, exploitCalls: calls }),
  })
  console.log(`  ${C.faint}settled in ${((Date.now() - started) / 1000).toFixed(1)}s${C.reset}`)
  await sleep(PACE * 0.6)

  // 4 — the verdict
  await phase(4, 'the verdict')
  const won = result.verdict === 'VALID'
  const badge = won ? `${C.green}${C.bold} VALID ${C.reset}` : `${C.red}${C.bold} SLASHED ${C.reset}`
  console.log(`  ${badge}  ${won ? 'the exploit flipped the invariant' : 'the invariant held'}`)
  console.log()
  console.log(`  ${C.ink}exploit${C.reset}     ${result.exploitTxHash}`)
  console.log(`  ${C.ink}settlement${C.reset}  ${result.settlementTxHash}`)
  console.log(`  ${C.ink}reputation${C.reset}  ${result.reputationTxHash} ${C.faint}(ERC-8004)${C.reset}`)
  console.log()
  console.log(`  ${C.faint}verify a real x402 stake settlement on HashScan:${C.reset}`)
  console.log(`    ${C.signal}${hashscanTx('0.0.10467075@1789161821.293370728')}${C.reset}`)
  console.log()
  console.log(`  ${C.faint}the contract decided. no human in the path.${C.reset}`)
  console.log()

  if (!won) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(`\n${C.red}demo failed:${C.reset} ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
