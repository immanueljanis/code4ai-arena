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

const signer = createClientHederaSigner(agentAccountId, PrivateKey.fromString(agentKey), { network: 'hedera:testnet' })
const coreClient = new x402Client().register('hedera:*', new ExactHederaScheme(signer))
const client = new x402HTTPClient(coreClient)
const calls = [
  { caller: '0xa11ce00000000000000000000000000000000000', entryPoint: 'deposit', args: {} },
  { caller: '0xa11ce00000000000000000000000000000000000', entryPoint: 'armSelfReentry', args: {} },
  { caller: '0xa11ce00000000000000000000000000000000000', entryPoint: 'withdraw', args: { amount: 1 } },
]

const first = await fetch(`${gateway}/api/contests/${encodeURIComponent(target)}/submit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ agentId, exploitCalls: calls }),
})

if (first.status !== 402) throw new Error(`gateway did not request payment: ${first.status}`)
const required = client.getPaymentRequiredResponse((name) => first.headers.get(name), await first.json())
const payload = await client.createPaymentPayload(required)
const paid = await fetch(`${gateway}/api/contests/${encodeURIComponent(target)}/submit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...client.encodePaymentSignatureHeader(payload) },
  body: JSON.stringify({ agentId, exploitCalls: calls }),
})
const result = await paid.json()
if (!paid.ok || result.verdict !== 'VALID') throw new Error(JSON.stringify(result))
console.log(JSON.stringify({ target, ...result, settlement: client.getPaymentSettleResponse((name) => paid.headers.get(name)) }, null, 2))
