# Deploying

Four services. Only the first two are required to demo; the facilitator is
needed for real x402 settlement, and the subgraph only feeds the reference
agent's history lookup.

| Service | What it needs | Image |
|---|---|---|
| Postgres | 1 database | managed |
| Arena server | Postgres, Hedera RPC | `Dockerfile` (repo root) |
| Facilitator | Postgres, its own Hedera account | `facilitator/Dockerfile` |
| Web | the server's public URL at **build** time | static, Vercel |

Both images are verified: they build and serve locally against the live
testnet deployment.

## Order

Postgres first, then the facilitator, then the server (it needs the
facilitator's URL), then the web build (it needs the server's URL).

## Per-service build settings

Each service is a separate deploy from the **same repo**. The only setting that
matters beyond env is each service's **Root Directory** — it fixes the build
context so the Dockerfile `COPY` paths and the config file resolve.

| Service | Platform | Root Directory | Builder | Config / build | Start | Health |
|---|---|---|---|---|---|---|
| Facilitator | Railway | `facilitator` | Dockerfile | `facilitator/railway.toml` → `Dockerfile` | (CMD) `bun run src/index.ts` :4020 | `/health` |
| Arena server | Railway | *(repo root)* | Dockerfile | `railway.toml` → `Dockerfile` | (CMD) `bun run src/index.ts` :8787 | `/api/health` |
| Web | Vercel | `web` | — | `web/vercel.json` → `bun run build` | static (Build Output API) | — |

Notes:

- **Server root = repo root**, not `server/`: the root `Dockerfile` compiles
  `contracts/` with Foundry in-image and copies `server/` + `contracts/out`, so
  it needs the whole repo as context. `contracts/out` is `.dockerignore`d on
  purpose — it is rebuilt in the image.
- **Facilitator root = `facilitator`**: its `Dockerfile` copies `package.json`,
  `bun.lock`, `src/` from the context root, so the context must be `facilitator/`.
- **Web** builds with nitro's Vercel preset (auto-selected when `VERCEL` is set;
  force with `NITRO_PRESET=vercel` if needed). Output goes to `.vercel/output`
  via the Build Output API, so leave Vercel's Output Directory on its default.

## Arena server

Railway reads `railway.toml`: Dockerfile build, health check on `/api/health`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | from the Postgres service |
| `HEDERA_TESTNET_RPC_URL` | `https://testnet.hashio.io/api` |
| `VERIFIER_KEY` | operator private key, `0x` + 64 hex. **Pays for everything** |
| `SERVER_WALLET_SECRET` | any long random string; encrypts agent keys at rest |
| `SETTLEMENT_PROFILE` | `demo-hts` |
| `DEMO_HTS_TOKEN_ID` | `0.0.10484976` |
| `ARENA_ADDRESS` | `0x9Ad18913366D32a46489d44aadb5e7cb85c2f00e` |
| `HEDERA_ARENA_ACCOUNT_ID` | `0.0.10520272` |
| `ACCESS_CONTROL_VAULT_ADDRESS` | `0x03C025EDF79E1B53Fb18994afecc001dA832afa3` |
| `ROUNDING_VAULT_ADDRESS` | `0xcdD583a4027370b299Af137cB92aa00CB9929F85` |
| `TIME_WINDOW_VAULT_ADDRESS` | `0x61780954E3Eea2Ee9508b83E4756097403341fF8` |
| `X402_FACILITATOR_URL` | the facilitator's public URL |
| `X402_FACILITATOR_ACCOUNT_ID` | `0.0.10467075` |
| `X402_SETTLEMENT_SECRET` | shared secret, must match the facilitator exactly |
| `MIN_OPERATOR_HBAR` | `2` (optional). Submissions pause with a 503 below this |

`SETTLEMENT_PROFILE=demo-hts` refuses to start without the facilitator URL,
account and secret, so a half-configured deploy fails at boot rather than at
the first payment.

## Facilitator

| Variable | Value |
|---|---|
| `DATABASE_URL` | the same Postgres |
| `FACILITATOR_ACCOUNT_ID` | `0.0.10467075` |
| `FACILITATOR_PRIVATE_KEY` | its own key, **not** the operator's |
| `FACILITATOR_TOKEN_ID` | `0.0.10484976` |
| `FACILITATOR_STAKE_AMOUNT` | `1000000` |
| `HEDERA_ARENA_ACCOUNT_ID` | `0.0.10520272` |
| `X402_SETTLEMENT_SECRET` | same value as the server |
| `PORT` | `4020` |

The account holds HBAR for transaction fees only. It never holds the settlement
token, so it needs no HTS association. A dedicated key matters: `/settle` is
authenticated with the shared secret, and this key is what co-signs payments.

## Web

Both variables are read at **build** time, so changing either needs a rebuild.

| Variable | Value |
|---|---|
| `VITE_API_URL` | the server's public URL |
| `VITE_SETTLEMENT_PROFILE` | `demo-hts` |
| `VITE_SUBGRAPH_URL` | optional; the subgraph query URL. Unset keeps the bundled exploit records |

Getting `VITE_SETTLEMENT_PROFILE` wrong is visible rather than silent: the
cockpit compares it against what `/api/state` reports and shows a mismatch
warning. Leaving `VITE_API_URL` unset is worse, because the app quietly falls
back to in-memory demo data that looks live.

## Subgraph

Optional. Deployed separately to Subgraph Studio, see `subgraph/README.md`.
When `SUBGRAPH_URL` is unset the reference agent plans without history rather
than failing.

## After deploying

```bash
curl <server>/api/health                       # {"ok":true}
curl <server>/api/state | jq .settlement       # profile must read demo-hts
curl <facilitator>/health                      # {"ok":true}
curl -X POST <facilitator>/settle -d '{}'      # 401, settlement is authenticated
```

Then check the operator balance. Each submission costs roughly 0.5 HBAR, and
provisioning a new agent about 1.7. Below `MIN_OPERATOR_HBAR` the arena stops
accepting work by design.
