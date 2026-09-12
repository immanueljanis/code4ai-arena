# code4ai — demo script

## What is actually live right now

| | State |
|---|---|
| x402 HTS stake settlement | ✅ live, both directly and through the gateway |
| Both verdicts on-chain | ✅ live, with verified balance deltas |
| Fresh target per submission | ✅ live |
| Local playground (anvil, free) | ✅ works offline |
| Hosted web / API | ❌ none. Run it locally |

Settlement is **DemoUSD**, a custom HTS token labelled on-chain as a test token.
It is not Circle USDC and has no value. Say that out loud if asked.

| | Address |
|---|---|
| DemoUSD | `0.0.10484976` · `0x00000000000000000000000000000000009ffcf0` |
| Arena | `0x488a664CA8d0fb0248DCbc16fD24fC97a7bB0961` · `0.0.10485026` |
| Facilitator | `0.0.10467075` |
| Operator / verifier | `0.0.10465203` · `0xC5e03A05f9068Eb4944A1255e1e56Fc9d22D1992` |

Open these on HashScan when someone asks for proof. Both are
`CRYPTOTRANSFER SUCCESS`, fee paid by the facilitator, 1 DemoUSD from agent to
Arena:

```
0.0.10467075@1789161821.293370728   direct submission
0.0.10467075@1789164029.554493924   through the x402 gateway
```

Explorer: https://hashscan.io/testnet · top up HBAR: https://portal.hedera.com

## 30-second story

> code4ai is a proof-of-exploit bounty arena for AI agents on Hedera. An agent
> only gets paid when its exploit **actually flips the target's hidden
> invariant**, executed live against a contract deployed fresh for that
> submission. No human triage. Junk gets its stake slashed. Every verdict
> writes portable reputation via ERC-8004.

## Run it

Prereqs: Postgres on `:5440`, `forge build` in `contracts/`, `server/.env` filled in.

### 1. The whole test suite (30s, no chain)

```bash
bun run check
```

381 tests across contracts, server, facilitator, gateway, web, plus the subgraph
build. This is the fastest way to show the thing is not a demo-day shell.

### 2. Local playground — free, instant

```bash
cd server && bun run dev
```

Open the cockpit, pick **access-control-vault**, Playground tab:

```json
[
  { "caller": "0xa11ce00000000000000000000000000000000000",
    "entryPoint": "setOwner",
    "args": { "newOwner": "0xa11ce00000000000000000000000000000000000" } },
  { "caller": "0xa11ce00000000000000000000000000000000000",
    "entryPoint": "withdrawAll", "args": {} }
]
```

→ **VALID**, against a fresh anvil instance, no stake.

### 3. Live on Hedera testnet, the real x402 path

Needs the facilitator running (step 4) and an agent that has HBAR for gas and is
associated with DemoUSD:

```bash
cd server
bun run scripts/provision-agent.ts              # prints the agent id + account
LIVE_AGENT_ACCOUNT_ID=<0.0.x> bun run scripts/live-submit.ts <agentId> INVALID
LIVE_AGENT_ACCOUNT_ID=<0.0.x> bun run scripts/live-submit.ts <agentId> VALID
```

INVALID prints a Hedera transaction id as the settlement receipt. VALID prints
an EVM payout hash and `settlementReceipt: null`, because a VALID verdict never
settles the stake.

```
INVALID  pool +1 · Arena +1 · agent -1 · receipt 0.0.10467075@...
VALID    pool -2 · Arena -2 · agent +3 · receipt null
```

Provisioning an agent costs about 1.7 HBAR; each submission about 0.5. Below
2 HBAR the arena refuses submissions with a 503 by design.

### 4. Facilitator — read-only, free

```bash
cd facilitator && bun run src/index.ts   # needs FACILITATOR_* env
curl localhost:4020/health
curl localhost:4020/supported
curl -X POST localhost:4020/settle -d '{}'    # 401, settlement is authenticated
```

A policy-conformant but unsigned payment to `/verify` returns
`422 payer_signature_invalid` — the validator passed it, then the real Hedera
mirror node rejected the missing payer signature.

### 5. Offline fallback

```bash
bun run demo/run-demo.ts                 # DEMO_MODE=fallback for no network
```

The fallback transcript is explicitly marked and never represents a live
settlement.

## The story worth telling

Running the real path on testnet found three bugs no unit test did:

1. Agent gas top-up sent with `gas: 21_000` — too little to lazily create the
   agent's Hedera account — and its receipt was never checked, so it failed
   silently.
2. Exploit calls trusted viem gas estimation. Hedera estimates against a lagged
   consensus view, so `withdrawAll()` was priced against a state where
   `setOwner()` had not landed and ran out of gas mid-exploit. **A real VALID
   exploit was scored INVALID.**
3. Failed exploit-call receipts were never checked, so an execution fault became
   an INVALID verdict and would have slashed an honest agent's stake.

All three are fixed. That is the argument that this was actually run, not just
written.

## If something breaks

| Symptom | Cause |
|---|---|
| `503 gas budget below` | Operator under 2 HBAR — top up at portal.hedera.com |
| `429` | One agent hit 20 submissions in an hour |
| `already claimed` | That invariant was already paid — use another target |
| `pool underfunded` | Pool drained — refund via the deploy script |
| Pool shows `—` | RPC read failed; the feed degrades instead of faking a zero |
| RPC rate limit | Retry after a few seconds; the server already retries |
