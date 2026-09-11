# code4ai — demo script

## What is actually live right now

Read this before demoing. Claiming more than this on stage will not survive a
judge opening HashScan.

| | State |
|---|---|
| Arena accounting on Hedera testnet | ✅ live and reproducible |
| Fresh target deployed per submission | ✅ live |
| Local playground (anvil, free, instant) | ✅ works offline |
| x402 HTS stake settlement | ⏳ pending — settlement token not minted yet |
| Hosted web / API | ❌ none. The old Railway API is gone (404) |

The live Arena settles a plain ERC-20 (`RHRSL`) standing in for the HTS token,
so every number below is real money movement — just not yet the x402 leg.

| | Address |
|---|---|
| Arena | `0x5928df319b3D062203D6aF33A6797df4a96b18a4` · `0.0.10472796` |
| RehearsalToken `RHRSL` | `0x074FDFaA6C79D9De16975f2f05AFdA91c6Ad0C8D` |
| Operator / verifier | `0xC5e03A05f9068Eb4944A1255e1e56Fc9d22D1992` · `0.0.10465203` |
| Facilitator | `0.0.10467075` |

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

379 tests across contracts, server, facilitator, gateway, web, plus the subgraph
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

### 3. Live on Hedera testnet — the real one

```bash
cd server
export REHEARSAL_ARENA_ADDRESS=0x5928df319b3D062203D6aF33A6797df4a96b18a4 \
       REHEARSAL_TOKEN_ADDRESS=0x074FDFaA6C79D9De16975f2f05AFdA91c6Ad0C8D \
       REHEARSAL_ACCESS_VAULT_ADDRESS=0x03C025EDF79E1B53Fb18994afecc001dA832afa3 \
       REHEARSAL_ROUNDING_VAULT_ADDRESS=0xcdD583a4027370b299Af137cB92aa00CB9929F85 \
       REHEARSAL_TIME_VAULT_ADDRESS=0x61780954E3Eea2Ee9508b83E4756097403341fF8 \
       HEDERA_ARENA_ACCOUNT_ID=0.0.10472796
bun run scripts/rehearse-live.ts
```

Runs INVALID then VALID end to end and asserts the balance deltas itself:

```
INVALID  pool +1 token · Arena token +1 · agent left with no stake
VALID    pool −2 token · Arena token −2 · agent +3 · payout = stake + bounty
         fresh target per submission (distinct addresses)
```

Costs ~1.5 HBAR per full run (agent gas top-up dominates). Add
`REHEARSAL_SCENARIOS=VALID` and `REHEARSAL_AGENT_ID=<uuid>` to rerun one branch
with an agent that already has gas — about 0.3 HBAR.

**Check the operator balance first.** Below 2 HBAR the arena refuses submissions
with a 503 by design.

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

Running the real path on testnet found three bugs 378 unit tests did not:

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
