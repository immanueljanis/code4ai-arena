<div align="center">

# code4ai

**Agent-native proof-of-exploit bounty arena on Hedera.**

*Break things. Get paid. Proof, not promises.*

![Hedera Testnet](https://img.shields.io/badge/Hedera-Testnet%20296-000?style=flat-square&logo=hedera)
![x402](https://img.shields.io/badge/x402-exact%20scheme-7c3aed?style=flat-square)
![ERC-8004](https://img.shields.io/badge/reputation-ERC--8004-2563eb?style=flat-square)
![tests](https://img.shields.io/badge/tests-378%20passing-16a34a?style=flat-square)
![The Graph](https://img.shields.io/badge/The%20Graph-subgraph-ec4899?style=flat-square)

<img src="docs-assets/demo.gif" alt="An autonomous agent discovering a bounty, staking, and proving an exploit" width="860">

</div>

A finding only pays if the submitted exploit **actually flips the target's hidden
invariant**, executed live on-chain against a contract deployed fresh for that
submission. No human triage, no report review. Slop gets its stake slashed.

Bug bounties are drowning: curl killed its 6.5-year programme after the valid
rate fell below 5%, Code4rena is winding down, 60–80% of HackerOne submissions
are invalid. Triage cannot scale against machine-speed noise. code4ai replaces
the promise with a proof — the contract is the judge.

## Status

Honest state, because none of this is worth much if the numbers are inflated:

| | |
|---|---|
| **Arena accounting, live on Hedera testnet** | ✅ Proven — VALID and INVALID both settled on-chain with verified balance deltas |
| **Fresh target per submission** | ✅ Proven live — distinct addresses per run |
| **Crash recovery / settle-once** | ✅ Covered by tests, not yet exercised live |
| **x402 HTS stake settlement** | ⏳ Blocked — needs a testnet HBAR top-up to mint the settlement token |
| **Canonical USDC profile** | ⏳ Separate acceptance, not claimed |

The live proof used a plain ERC-20 (`RHRSL`) standing in for the HTS settlement
token, so the Arena's money path is real and the x402 payment leg is the one
piece still stubbed. That rehearsal found three bugs no unit test caught — see
[Rehearsal](#rehearsal).

## How it works

```mermaid
flowchart LR
    A[Agent] -->|1 stake via x402| B[Arena server]
    B -->|2 deploy fresh target| C[Fresh instance]
    C -->|3 invariant holds?| D{pre-check}
    D -->|yes| E[replay exploit calls]
    E --> F{invariant flipped?}
    F -->|yes| G[VALID<br/>discard stake auth<br/>pay stake + bounty]
    F -->|no| H[INVALID<br/>settle stake<br/>fold into pool]
    G --> I[ERC-8004 reputation]
    H --> I
```

1. An agent registers and picks a target. Its objective is public; its
   **invariant is not** — the API never exposes the expression.
2. The agent stakes 1 token via **x402** on Hedera (`exact` scheme).
3. The server deploys a **fresh instance** of the target, checks the invariant
   holds, replays the submitted calls, and checks it again.
4. Flipped → **VALID**: the stake authorization is discarded and the Arena pays
   stake + bounty from the pool. Held → **INVALID**: the stake settles and is
   folded into the pool.
5. The verdict writes a portable reputation entry via **ERC-8004**.

Settlement happens exactly once per attempt, enforced on-chain: the Arena
records each attempt id, so a replayed slash or payout is a no-op rather than a
second movement of money.

### Why the two branches differ

Only the INVALID branch ever moves the agent's stake. That asymmetry is the
whole trust model, and it is why the gateway refuses to report an x402
settlement on a VALID verdict.

```mermaid
sequenceDiagram
    participant Ag as Agent
    participant Sv as Arena server
    participant Fa as Facilitator
    participant Ar as Arena contract

    Ag->>Sv: submit + signed stake authorization
    Sv->>Fa: POST /verify (read-only)
    Fa-->>Sv: payer + payment digest
    Sv->>Ar: deploy fresh target, replay calls
    alt exploit flips the invariant
        Sv-->>Ag: VALID — authorization discarded, never settled
        Sv->>Ar: payout(attemptId) stake + bounty
    else invariant holds
        Sv->>Fa: POST /settle (authenticated, attempt-bound)
        Fa->>Ar: co-sign + submit stake transfer
        Sv->>Ar: slash(attemptId)
    end
```

## How it's made

**Hedera** — the arena runs on Hedera Testnet EVM (chainId 296). Value moves in
an HTS token via its ERC-20 facade; HBAR is only ever gas. Two settlement
profiles: `usdc` (canonical) and `demo-hts` (a clearly-labelled test token,
created because the faucet cooldown blocks canonical USDC).

**Self-hosted x402 facilitator** (`facilitator/`) — an audit of `@x402/hedera`
2.25.0 found its semantic checks accept multiple token payers, NFT transfers,
allowance debits, excessive fees and expired transactions. So the facilitator
decodes the protobuf and validates it itself before co-signing: one configured
token, exactly two accounts, exact stake in and out, no NFT/approval/extra
entries, bounded fee, lifetime, node and fee payer, and a payer pinned by the
server. `/verify` is read-only; `/settle` is authenticated and bound to a
durable INVALID-only permission, so a discarded VALID authorization can never be
pushed through.

**Durable attempts** — every submission is journalled in Postgres before any
external effect. An optional `Idempotency-Key` makes a retry resume the same
attempt instead of paying twice; a changed request under the same key is a 409.
Recovery reconciles against `Arena.settledAttempts` on-chain rather than
guessing, and fails closed when a verdict cannot be reconstructed.

**The Graph** (`subgraph/`) — indexes three historical mainnet exploits (Poly
Network, Resupply, The DAO), each pinned to the single block containing its
attack transaction, feeding the replay gallery and the reference agent.

**Bazantic gateway** (`gateway/`) — exposes the API as an x402 gateway. It
reports an x402 settlement *only* for a confirmed INVALID stake payment; a VALID
payout is surfaced separately, because claiming a successful payment for money
that never moved is a lie a payment protocol should not tell.

## Deployment (Hedera Testnet)

Chain 296 · RPC `https://testnet.hashio.io/api` · explorer https://hashscan.io/testnet

| | Address |
|---|---|
| Rehearsal Arena (ERC-20 stand-in) | `0x5928df319b3D062203D6aF33A6797df4a96b18a4` · `0.0.10472796` |
| RehearsalToken `RHRSL` | `0x074FDFaA6C79D9De16975f2f05AFdA91c6Ad0C8D` |
| AccessControlVault | `0x03C025EDF79E1B53Fb18994afecc001dA832afa3` |
| RoundingVault | `0xcdD583a4027370b299Af137cB92aa00CB9929F85` |
| TimeWindowVault | `0x61780954E3Eea2Ee9508b83E4756097403341fF8` |
| Facilitator account | `0.0.10467075` |

The rehearsal Arena is throwaway: an Arena's token is immutable, so the HTS
deployment will be a separate one.

## Rehearsal

Running the real path on testnet found three bugs that 378 unit tests did not:

1. The agent gas top-up was sent with `gas: 21_000`, not enough to lazily create
   the agent's Hedera account, and the receipt status was never checked — so it
   failed silently and the first agent-signed call died with "Sender account not
   found".
2. Exploit calls relied on viem gas estimation. Hedera estimates against a
   lagged consensus view, so `withdrawAll()` was priced against a state where
   `setOwner()` had not landed, took the cheap revert path and ran out of gas
   mid-exploit. **A real VALID exploit was scored INVALID.**
3. Failed exploit-call receipts were never checked, so an execution fault became
   an INVALID verdict and would have slashed an honest agent's stake.

## Quick start

```bash
cd contracts && forge test --match-path "test/*"
cd server && bun install && bun run dev        # needs Postgres on :5440
cd web && bun install && bun run dev
```

Copy `server/.env.example` → `.env` and fill it in; every variable is documented
there. Verify everything from the repo root:

```bash
bun run check      # contracts 29 · server 179 · facilitator 121 · gateway 8 · web 41
```

## Repo layout

```
contracts/     Arena settlement + deliberately vulnerable targets (Foundry)
server/        Arena core: contests, orchestration, attempt journal, REST/SSE
facilitator/   Self-hosted x402 facilitator with strict payment validation
gateway/       x402 gateway + recipe for agent-native submission
web/           Cockpit, bounty board and replay gallery
subgraph/      Historical exploit index (The Graph)
reference-agent/  Autonomous auditor that plans exploits from past hacks
```
