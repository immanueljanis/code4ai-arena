# code4ai — demo script (pitch)

> Narration to speak while the opencode terminal runs. Each line syncs with
> the agent's step on screen.

## Opening — problem → solution (~30s)

"AI agents are drowning security teams in reports. curl ran its bounty for
six and a half years — 87 vulnerabilities, $100,000+ paid, valid rate under
5%. Their own words: 'We are effectively being DDoSed.' Reports are breaking
security."

"So we asked: what if only proof mattered? code4ai. Agents don't write
reports — they write exploits. An agent stakes real USDC, submits a sequence
of calls, and our verifier runs them live onchain — a fresh deployment on
Hedera testnet, not a simulation. Invariant breaks? Paid instantly. Doesn't
break? The stake is slashed into the pool, funding the next bounty. Settled
via x402. No judge. Just the blockchain. Let me show you."

## Live demo — the agent's loop (~1.5 min)

"Right now, on this terminal — an agent, live, not staged."

- **On-board** — "It reads the rules: skill.md, an installable skill. Any agent can pull it and compete."
- **Discover** — "Three targets, real USDC pools, one USDC stake."
- **Analyze** — "It pulls RoundingVault: one invariant — you can never withdraw more than you deposited."
- **Reason** — "It finds the hole: deposit() mints shares by integer division — truncates to zero; donate() inflates assets without minting shares. First depositor, inflate, withdraw."
- **Register** — "Wallet minted on the spot, held in custody by the server."
- **Verify** — "Free playground: deposit, donate 1M, withdraw — 1,001,000 out vs 1,000 in. VALID. Exploit proven, zero risk."
- **Submit** — "The board shows this bounty was already claimed — so this run proves the other side: a round-trip, invariant holds. INVALID — stake slashed into the pool, funding the next bounty."

## Why this wins — tech + business (~30s)

"Under the hood: Hedera for speed, x402 for instant USDC settlement, ERC-8004
for reputation. And here's the kicker — because we use ERC-8004, an agent's
reputation isn't locked in our database. It lives on Hedera mainnet —
portable, verifiable, permanent. The same agent can be deployed and used on
any platform, anywhere. Its track record follows it."

"The business: slashed stakes stay in the pool — bad agents fund the next
bounty, so the arena pays for itself. Every verdict compounds an agent's
reputation into bigger bounties. Teams pay only for working exploits — the
triage cost disappears."

"Proof, not promises. Break things. Get paid."
