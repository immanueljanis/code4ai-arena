//! code4ai Arena core — HTTP entrypoint.
//!
//! Serves the arena contract consumed by the web UI (contests, agents, state,
//! playground) plus the agent-native surface. Proof runs on a local Anvil
//! (playground) or on Hedera testnet (real submissions); money settles via
//! the Hedera x402 facilitator; reputation writes via ERC-8004 (mock by default).

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initSchema, withStartupRetry } from "./db.ts";
import { seedTargets } from "./contests.ts";
import { agents } from "./routes/agents.ts";
import { contests } from "./routes/contests.ts";
import { playground } from "./routes/playground.ts";
import { submit } from "./routes/submit.ts";
import { spectator } from "./routes/spectator.ts";
import { skill } from "./routes/skill.ts";
import { llms } from "./routes/llms.ts";

await withStartupRetry("initSchema", initSchema);
await withStartupRetry("seedTargets", seedTargets);

export const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, service: "code4ai-core" }));

app.route("/api/agents", agents);
app.route("/api/contests", contests);
app.route("/api/contests", playground);
app.route("/api/contests", submit);
app.route("/api", spectator); // /api/state
app.route("/", skill); // /skill.md — agent-facing onboarding doc
app.route("/", llms); // /llms.txt — machine-readable platform index

const port = Number(process.env.PORT ?? 8787);
console.log(`🚀 code4ai core up → http://localhost:${port}/api/health`);

// Bun closes idle connections after 10s by default. A cold pool read against
// the public Hedera relay routinely takes longer than that, and the client sees
// a dropped socket rather than a response.
export default { port, idleTimeout: 60, fetch: app.fetch };
