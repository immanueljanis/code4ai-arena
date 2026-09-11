import { x402Client } from '@x402/core/client'
import { x402HTTPClient } from '@x402/core/http'
import { createClientHederaSigner, ExactHederaScheme, PrivateKey } from '@x402/hedera'

const gateway = process.env.BAZANTIC_GATEWAY ?? 'http://localhost:8788'
const target = process.env.TARGET ?? 'reentrancy-vault'
const agentId = process.env.AGENT_ID
const agentAccountId = process.env.HEDERA_AGENT_ACCOUNT_ID
const agentKey = process.env.HEDERA_AGENT_PRIVATE_KEY

if (!agentId || !agentAccountId || !agentKey) {
  throw new Error('AGENT_ID, HEDERA_AGENT_ACCOUNT_ID, and HEDERA_AGENT_PRIVATE_KEY are required')
}

// ECDSA, not fromString: these agent wallets are EVM-derived, and fromString
// defaults to ED25519, which signs with the wrong key entirely.
const signer = createClientHederaSigner(agentAccountId, PrivateKey.fromStringECDSA(agentKey), { network: 'hedera:testnet' })
// The x402 client only allows assets it recognizes as defaults, so a custom
// settlement token has to be opted into explicitly with a per-payment cap.
// Without this, createPaymentPayload rejects the requirement client-side.
const asset = process.env.SETTLEMENT_ASSET_ID
const maxAmountPerPayment = process.env.SETTLEMENT_MAX_ATOMIC ?? '1000000'
const coreClient = new x402Client().register('hedera:*', new ExactHederaScheme(signer))
if (asset) {
  coreClient.setSpendControls({
    allowedAssets: [{ network: 'hedera:testnet', asset, maxAmountPerPayment }],
  })
}
const client = new x402HTTPClient(coreClient)
const expectedVerdict = process.env.EXPECT_VERDICT ?? 'VALID'
const calls = process.env.EXPLOIT_CALLS
  ? (JSON.parse(process.env.EXPLOIT_CALLS) as Array<Record<string, unknown>>)
  : [
      { caller: '0xa11ce00000000000000000000000000000000000', entryPoint: 'deposit', args: {} },
      { caller: '0xa11ce00000000000000000000000000000000000', entryPoint: 'armSelfReentry', args: {} },
      { caller: '0xa11ce00000000000000000000000000000000000', entryPoint: 'withdraw', args: { amount: 1 } },
    ]

const idempotencyKey = process.env.IDEMPOTENCY_KEY ?? crypto.randomUUID()

const first = await fetch(`${gateway}/api/contests/${encodeURIComponent(target)}/submit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ agentId, exploitCalls: calls }),
})

if (first.status !== 402) throw new Error(`gateway did not request payment: ${first.status}`)
const required = client.getPaymentRequiredResponse((name) => first.headers.get(name), await first.json())
const payload = await client.createPaymentPayload(required)
const paid = await fetch(`${gateway}/api/contests/${encodeURIComponent(target)}/submit`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'Idempotency-Key': idempotencyKey,
    ...client.encodePaymentSignatureHeader(payload),
  },
  body: JSON.stringify({ agentId, exploitCalls: calls }),
})
const result = await paid.json()
if (!paid.ok || result.verdict !== expectedVerdict) throw new Error(JSON.stringify(result))
// A VALID verdict discards the stake authorization, so there is no x402
// settlement to report — the pool payout is the money that actually moved.
console.log(JSON.stringify({
  target,
  idempotencyKey,
  ...result,
  stakeSettlement: paid.headers.get('PAYMENT-RESPONSE')
    ? client.getPaymentSettleResponse((name) => paid.headers.get(name))
    : null,
  payoutTransaction: paid.headers.get('X-CODE4AI-PAYOUT'),
}, null, 2))
