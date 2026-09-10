import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from '@x402/core/http'

const UPSTREAM_PORT = 8899

interface UpstreamCall {
  idempotencyKey: string | null
  body: Record<string, unknown>
}

let calls: UpstreamCall[] = []
let upstreamResponse: Record<string, unknown> = {}
let upstreamStatus = 200
let server: ReturnType<typeof Bun.serve> | undefined
let app: { fetch: (request: Request) => Response | Promise<Response> }

const authorization = {
  x402Version: 2 as const,
  accepted: {
    scheme: 'exact',
    network: 'hedera:testnet',
    amount: '1000000',
    asset: '0.0.5555',
    payTo: '0.0.2002',
    maxTimeoutSeconds: 300,
    extra: { feePayer: '0.0.800' },
  },
  payload: { transaction: 'ZGVtbw==' },
}

beforeEach(async () => {
  calls = []
  upstreamStatus = 200
  upstreamResponse = {}
  server = Bun.serve({
    port: UPSTREAM_PORT,
    async fetch(request) {
      calls.push({
        idempotencyKey: request.headers.get('Idempotency-Key'),
        body: (await request.json()) as Record<string, unknown>,
      })
      return new Response(JSON.stringify(upstreamResponse), {
        status: upstreamStatus,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  process.env.CODE4AI_API = `http://localhost:${UPSTREAM_PORT}`
  process.env.SETTLEMENT_PROFILE = 'demo-hts'
  process.env.DEMO_HTS_TOKEN_ID = '0.0.5555'
  process.env.HEDERA_ARENA_ACCOUNT_ID = '0.0.2002'
  process.env.X402_FACILITATOR_ACCOUNT_ID = '0.0.800'
  app = (await import(`../src/index.ts?cache=${crypto.randomUUID()}`)).default
})

afterEach(() => {
  server?.stop(true)
})

function submit(headers: Record<string, string> = {}) {
  return app.fetch(
    new Request('http://gateway/api/contests/reentrancy-vault/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ agentId: 'agent-1', exploitCalls: [] }),
    })
  )
}

const paid = (extra: Record<string, string> = {}) => ({
  'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(authorization as never),
  ...extra,
})

describe('payment required', () => {
  test('advertises the configured demo test token, not USDC', async () => {
    const response = await submit()
    expect(response.status).toBe(402)
    const body = (await response.json()) as Record<string, any>
    expect(body.accepts[0].asset).toBe('0.0.5555')
    expect(body.settlementAsset).toMatchObject({
      profile: 'demo-hts',
      symbol: 'DemoUSD',
      tokenId: '0.0.5555',
      decimals: 6,
      testToken: true,
    })
    expect(JSON.stringify(body)).not.toContain('USDC')
    expect(decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED')!)).toMatchObject({
      x402Version: 2,
    })
  })
})

describe('settlement semantics', () => {
  test('reports a confirmed stake settlement only on the INVALID branch', async () => {
    upstreamResponse = {
      verdict: 'INVALID',
      settlementTxHash: '0.0.1001@1700000000.000000001',
      attemptId: 'attempt-invalid',
    }
    const response = await submit(paid())
    const header = response.headers.get('PAYMENT-RESPONSE')
    expect(header).toBeTruthy()
    expect(decodePaymentResponseHeader(header!)).toMatchObject({
      success: true,
      transaction: '0.0.1001@1700000000.000000001',
    })
    expect(response.headers.get('X-CODE4AI-PAYOUT')).toBeNull()
    expect(response.headers.get('X-CODE4AI-ATTEMPT')).toBe('attempt-invalid')
  })

  test('never claims a successful payment for a VALID payout', async () => {
    upstreamResponse = {
      verdict: 'VALID',
      settlementTxHash: '0xpayout',
      attemptId: 'attempt-valid',
    }
    const response = await submit(paid())
    expect(response.headers.get('PAYMENT-RESPONSE')).toBeNull()
    expect(response.headers.get('X-CODE4AI-PAYOUT')).toBe('0xpayout')
    expect(response.headers.get('X-CODE4AI-ATTEMPT')).toBe('attempt-valid')
  })

  test('does not report settlement when the upstream submission failed', async () => {
    upstreamStatus = 500
    upstreamResponse = { error: 'boom', verdict: 'INVALID', settlementTxHash: '0.0.1@1.1' }
    const response = await submit(paid())
    expect(response.status).toBe(500)
    expect(response.headers.get('PAYMENT-RESPONSE')).toBeNull()
    expect(response.headers.get('X-CODE4AI-PAYOUT')).toBeNull()
  })
})

describe('retry identity', () => {
  test('forwards the Idempotency-Key unchanged and echoes it back', async () => {
    upstreamResponse = { verdict: 'INVALID', settlementTxHash: '0.0.1@1.1' }
    const response = await submit(paid({ 'Idempotency-Key': 'retry-abc_123' }))
    expect(calls).toHaveLength(1)
    expect(calls[0].idempotencyKey).toBe('retry-abc_123')
    expect(response.headers.get('Idempotency-Key')).toBe('retry-abc_123')
  })

  test('omits the key upstream when the client did not send one', async () => {
    upstreamResponse = { verdict: 'INVALID', settlementTxHash: '0.0.1@1.1' }
    await submit(paid())
    expect(calls[0].idempotencyKey).toBeNull()
  })
})

describe('payment signature', () => {
  test('demands payment before forwarding anything upstream', async () => {
    await submit()
    expect(calls).toHaveLength(0)
  })

  test('forwards the decoded authorization to the arena server', async () => {
    upstreamResponse = { verdict: 'INVALID', settlementTxHash: '0.0.1@1.1' }
    await submit(paid())
    expect(calls[0].body.x402Authorization).toMatchObject({ x402Version: 2 })
  })
})
