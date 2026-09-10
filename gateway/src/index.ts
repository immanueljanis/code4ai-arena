import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import { Hono } from 'hono'

const api = process.env.CODE4AI_API ?? 'http://localhost:8787'
const port = Number(process.env.PORT ?? 8788)
const arenaAccountId = process.env.HEDERA_ARENA_ACCOUNT_ID ?? '0.0.1234'
const facilitatorAccountId = process.env.X402_FACILITATOR_ACCOUNT_ID ?? '0.0.7162784'
const profile = process.env.SETTLEMENT_PROFILE === 'demo-hts' ? 'demo-hts' : 'usdc'
const asset = profile === 'demo-hts'
  ? (process.env.DEMO_HTS_TOKEN_ID ?? '')
  : (process.env.HEDERA_USDC_TESTNET_ID ?? '0.0.429274')
const symbol = profile === 'demo-hts' ? 'DemoUSD' : 'USDC'
const network = 'hedera:testnet'

if (!asset) throw new Error('DEMO_HTS_TOKEN_ID is required when SETTLEMENT_PROFILE=demo-hts')

const app = new Hono()

function paymentRequired() {
  return {
    x402Version: 2,
    accepts: [{
      scheme: 'exact',
      network,
      amount: '1000000',
      asset,
      payTo: arenaAccountId,
      maxTimeoutSeconds: 300,
      extra: { feePayer: facilitatorAccountId },
    }],
    settlementAsset: {
      profile,
      symbol,
      tokenId: asset,
      decimals: 6,
      testToken: profile === 'demo-hts',
    },
  }
}

app.get('/health', (c) => c.json({ ok: true, upstream: api, network, settlementAsset: paymentRequired().settlementAsset }))

app.post('/api/contests/:key/submit', async (c) => {
  const signature = c.req.header('PAYMENT-SIGNATURE')
  if (!signature) {
    const required = paymentRequired()
    return new Response(JSON.stringify(required), {
      status: 402,
      headers: {
        'content-type': 'application/json',
        'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required),
      },
    })
  }

  let authorization: unknown
  try {
    authorization = decodePaymentSignatureHeader(signature)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'invalid payment signature' }, 400)
  }

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  body.x402Authorization = authorization
  const idempotencyKey = c.req.header('Idempotency-Key')
  const upstream = await fetch(`${api}/api/contests/${encodeURIComponent(c.req.param('key'))}/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await upstream.text()
  const headers = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  if (upstream.ok) {
    const result = JSON.parse(text) as { verdict?: string; settlementTxHash?: string; attemptId?: string }
    if (result.attemptId) headers.set('X-CODE4AI-ATTEMPT', result.attemptId)
    // Only the INVALID branch actually settles the x402 stake. A VALID verdict
    // discards the authorization and pays out of the pool, so reporting it as a
    // successful payment settlement would claim money moved that never did.
    if (result.verdict === 'INVALID' && result.settlementTxHash) {
      headers.set('PAYMENT-RESPONSE', encodePaymentResponseHeader({
        success: true,
        transaction: result.settlementTxHash,
        network,
      }))
    } else if (result.verdict === 'VALID' && result.settlementTxHash) {
      headers.set('X-CODE4AI-PAYOUT', result.settlementTxHash)
    }
  }
  return new Response(text, { status: upstream.status, headers })
})

if (import.meta.main) {
  Bun.serve({ port, fetch: app.fetch })
  console.log(`gateway listening on http://localhost:${port}`)
}

export default app
