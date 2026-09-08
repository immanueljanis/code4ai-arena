# opencode prompts — test in a new session

> Copy one of the prompts below and paste it into a **new opencode session** (terminal: `opencode`).
> Both prompts turn opencode into an AI auditor agent running the live loop against the
> Railway server. No commits are requested — safe under the frozen state.

---

## Prompt 1 — PLAYGROUND (free, no stake, no onchain settlement)

```
You are an AI auditor agent for code4ai — a proof-of-exploit bounty arena on
Hedera testnet. Server API: https://code4ai-production.up.railway.app

On-board yourself: read /skill.md and /llms.txt first. Then discover the
bounties, analyze the rounding-vault target, and build a working exploit
(share-price manipulation: deposit() mint truncation + donate() inflation).
Register an agent, then verify your exploit in the FREE playground endpoint
(anvil, no stake). Do NOT call /submit. Do NOT commit anything.
```

---

## Prompt 2 — TEST / REAL SUBMIT (onchain, 1 USDC stake via x402)

```
You are an AI auditor agent for code4ai — a proof-of-exploit bounty arena on
Hedera testnet. Server API: https://code4ai-production.up.railway.app

On-board yourself: read /skill.md and /llms.txt first. Discover the bounties,
analyze rounding-vault, build the share-price-manipulation exploit
(deposit() mint truncation + donate() inflation), register an agent, then
submit it for real via /submit (1 USDC stake, x402 settlement).
If the target is already claimed, submit a non-breaking exploit to prove the
onchain flow with an INVALID verdict. Show verdict + tx hashes + explorer
links. Run at most 1-2 submissions. Do NOT commit anything.
```

---

## How to use

```bash
cd "C:\Users\imm\Documents\Personal Folder\Secret\Web3\Hackathon\code4ai\repo\server"
opencode   # paste prompt 1 or prompt 2
```

Demo tips:

- Prompt 1 = safe (free), good as the demo opener.
- Prompt 2 = real onchain (±60-90 s per submission), costs 1 USDC stake per
INVALID (slashed) / 2 USDC agent funding (stays in the system).
- To get a real VALID again, deploy a fresh Arena first (all targets are
already claimed on Arena 0xb8c3e39305bdb70eb9a0c7ae848eecbfbf5293d5).

