import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import { Hono } from 'hono'

const api = process.env.CODE4AI_API ?? 'http://localhost:8787'
const port = Number(process.env.PORT ?? 8788)
const arenaAccountId = process.env.HEDERA_ARENA_ACCOUNT_ID ?? '0.0.1234'
const facilitatorAccountId = process.env.X402_FACILITATOR_ACCOUNT_ID ?? '0.0.7162784'
const asset = process.env.HEDERA_USDC_TESTNET_ID ?? '0.0.429274'
const network = 'hedera:testnet'

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
  }
}

app.get('/health', (c) => c.json({ ok: true, upstream: api, network }))

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
  const upstream = await fetch(`${api}/api/contests/${encodeURIComponent(c.req.param('key'))}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await upstream.text()
  const headers = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
  if (upstream.ok) {
    const result = JSON.parse(text) as { settlementTxHash?: string }
    if (result.settlementTxHash) {
      headers.set('PAYMENT-RESPONSE', encodePaymentResponseHeader({
        success: true,
        transaction: result.settlementTxHash,
        network,
      }))
    }
  }
  return new Response(text, { status: upstream.status, headers })
})

if (import.meta.main) {
  Bun.serve({ port, fetch: app.fetch })
  console.log(`gateway listening on http://localhost:${port}`)
}

export default app
