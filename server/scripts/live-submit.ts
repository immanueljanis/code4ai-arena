import { serverConfig } from "../src/config.ts";
import { getAgent, getSubmissionAttempt } from "../src/db.ts";
import { runSubmit } from "../src/agentRunner.ts";
import { getPool, invalidatePool } from "../src/arena.ts";
import { initSchema } from "../src/db.ts";
import { seedTargets } from "../src/contests.ts";

const MIRROR = process.env.HEDERA_MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";

const log = (event: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...data }));

async function tokenBalance(accountId: string): Promise<bigint> {
  const response = await fetch(
    `${MIRROR}/api/v1/accounts/${accountId}/tokens?token.id=${serverConfig.settlementTokenId}`,
    { signal: AbortSignal.timeout(20_000) }
  );
  if (!response.ok) return 0n;
  const body = (await response.json()) as { tokens?: Array<{ balance: number }> };
  return BigInt(body.tokens?.[0]?.balance ?? 0);
}

/**
 * One real submission through the full production path: x402 stake signed by
 * the agent, verified and (on INVALID) settled by the self-hosted facilitator,
 * proved against a freshly deployed target, settled once on the Arena.
 */
async function main(): Promise<void> {
  const agentId = process.argv[2];
  const scenario = (process.argv[3] ?? "INVALID").toUpperCase();
  const targetKey = process.argv[4] ?? "access-control-vault";
  if (!agentId) throw new Error("usage: live-submit.ts <agentId> [VALID|INVALID] [targetKey]");

  await initSchema();
  await seedTargets();

  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);

  const calls =
    scenario === "VALID"
      ? [
          { caller: agent.walletAddress, entryPoint: "setOwner", args: { newOwner: agent.walletAddress } },
          { caller: agent.walletAddress, entryPoint: "withdrawAll", args: {} },
        ]
      : [{ caller: agent.walletAddress, entryPoint: "setOwner", args: { newOwner: agent.walletAddress } }];

  const arenaAccount = serverConfig.hederaArenaAccountId;
  const agentAccount = process.env.LIVE_AGENT_ACCOUNT_ID;
  if (!agentAccount) throw new Error("LIVE_AGENT_ACCOUNT_ID is required for balance checks");

  invalidatePool(targetKey);
  const before = {
    pool: await getPool(targetKey),
    arena: await tokenBalance(arenaAccount),
    agent: await tokenBalance(agentAccount),
  };
  log("before", {
    scenario,
    pool: before.pool.toString(),
    arena: before.arena.toString(),
    agent: before.agent.toString(),
  });

  const result = await runSubmit(agentId, targetKey, calls);

  invalidatePool(targetKey);
  const after = {
    pool: await getPool(targetKey),
    arena: await tokenBalance(arenaAccount),
    agent: await tokenBalance(agentAccount),
  };
  const attempt = await getSubmissionAttempt(result.attemptId);

  log("result", {
    ...result,
    phase: attempt?.phase,
    poolDelta: (after.pool - before.pool).toString(),
    arenaDelta: (after.arena - before.arena).toString(),
    agentDelta: (after.agent - before.agent).toString(),
    settlementReceipt: attempt?.settlementReceipt,
    symbol: serverConfig.settlementSymbol,
  });
}

await main();
