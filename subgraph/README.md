# Exploit history subgraph

Indexes three historical Ethereum mainnet exploits and maps each to the arena
target that reproduces its bug class. The reference agent reads this history
before planning an exploit; when `SUBGRAPH_URL` is unset it simply plans without
history, so the arena does not depend on this being deployed.

| Target | Incident | Block |
| --- | --- | --- |
| access-control-vault | Poly Network | 12996659 |
| rounding-vault | Resupply Finance | 22785461 |
| reentrancy-vault | The DAO | 1718497 |

Each data source is pinned to the single block containing its attack
transaction via `startBlock` + `endBlock`, and every handler filters on the exact
transaction hash. Indexing is therefore near-instant rather than a full mainnet
scan. `HistoricalExploit` is immutable and keyed by the attack transaction, so
the handlers guard against the repeated writes a single attack produces (The DAO
transaction alone emits ten matching `Transfer` events).

## Deploy

Requires a Graph Studio account; the deploy key is yours and is never stored here.

    cd subgraph
    bun install
    bun run codegen
    bun run build

    bunx graph auth <deploy-key>          # from thegraph.com/studio
    SUBGRAPH_SLUG=<your-slug> bun run deploy

Studio prints a query URL once the subgraph has synced. Verify it end to end:

    SUBGRAPH_URL=<query-url> bun run sanity

The sanity check fails loudly unless all three targets are present exactly once,
with the expected incident, block, chain and a well-formed attack transaction.

Then point the consumers at the same URL:

    reference-agent   SUBGRAPH_URL=<query-url> bun run start
