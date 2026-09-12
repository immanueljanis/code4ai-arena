import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REQUIRED = [
  "REHEARSAL_ARENA_ADDRESS",
  "REHEARSAL_TOKEN_ADDRESS",
  "REHEARSAL_ACCESS_VAULT_ADDRESS",
  "REHEARSAL_ROUNDING_VAULT_ADDRESS",
  "REHEARSAL_TIME_VAULT_ADDRESS",
] as const;
for (const key of REQUIRED) {
  if (!process.env[key]) throw new Error(`missing required env var ${key}`);
}

process.env.ARENA_ADDRESS = process.env.REHEARSAL_ARENA_ADDRESS;
process.env.HEDERA_USDC_TESTNET_ADDRESS = process.env.REHEARSAL_TOKEN_ADDRESS;
process.env.ACCESS_CONTROL_VAULT_ADDRESS = process.env.REHEARSAL_ACCESS_VAULT_ADDRESS;
process.env.ROUNDING_VAULT_ADDRESS = process.env.REHEARSAL_ROUNDING_VAULT_ADDRESS;
process.env.TIME_WINDOW_VAULT_ADDRESS = process.env.REHEARSAL_TIME_VAULT_ADDRESS;
process.env.SETTLEMENT_PROFILE = "usdc";
process.env.HEDERA_USDC_TESTNET_ID = "0.0.429274";
process.env.HEDERA_ARENA_ACCOUNT_ID = process.env.HEDERA_ARENA_ACCOUNT_ID || "0.0.1234";

const { serverConfig } = await import("../src/config.ts");
const { initSchema, insertAgent, getAgent, getSubmissionAttempt, discardPaymentAuthorization } = await import("../src/db.ts");
const { seedTargets, getTargetMeta } = await import("../src/contests.ts");
const { runSubmit } = await import("../src/agentRunner.ts");
const { decryptPrivateKey, encryptPrivateKey, generateAgentWallet } = await import("../src/wallet.ts");
const { runOnchainVerification } = await import("../src/verifier-onchain.ts");
const { payout, slash, invalidatePool, getPool, isAttemptSettled } = await import("../src/arena.ts");
const { ensureAgentUsdc, ERC20_ABI } = await import("../src/fund.ts");
const { realSpendGuards } = await import("../src/limits.ts");
import type { SubmitDeps } from "../src/agentRunner.ts";

const STAKE = 1_000_000n;
const TARGET = "access-control-vault";

const chain = (): Chain => ({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [serverConfig.rpcUrl] } },
  testnet: true,
});
const transport = http(serverConfig.rpcUrl, { retryCount: 5, retryDelay: 1500 });
const publicClient = createPublicClient({ chain: chain(), transport });

const tokenBalance = (who: Address) =>
  publicClient.readContract({
    address: serverConfig.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [who],
  }) as Promise<bigint>;

const log = (event: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...data }));

/**
 * Stands in for the x402 stake settlement. The real leg is a native HTS
 * transfer the facilitator co-signs; here the agent moves the same amount of
 * the rehearsal ERC-20 to the Arena, so slash folds a stake that genuinely
 * arrived and pool conservation stays meaningful.
 */
function stakeTransferDeps(agentKey: `0x${string}`): SubmitDeps {
  return {
    verify: runOnchainVerification,
    signAuth: async () => ({
      x402Version: 2 as const,
      accepted: {
        scheme: "exact" as const,
        network: "hedera:testnet" as const,
        amount: STAKE.toString(),
        asset: serverConfig.hederaUsdcTokenId,
        payTo: serverConfig.hederaArenaAccountId,
        maxTimeoutSeconds: 300,
        extra: { feePayer: serverConfig.hederaFacilitatorAccountId },
      },
      payload: { transaction: "cmVoZWFyc2Fs" },
    }),
    verifyAuth: async () => ({ payer: "rehearsal", paymentDigest: "rehearsal:no-x402" }),
    settleAuth: async () => {
      const agent = privateKeyToAccount(agentKey);
      const wallet = createWalletClient({ chain: chain(), transport, account: agent });
      const hash = await wallet.writeContract({
        address: serverConfig.usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [serverConfig.arenaAddress, STAKE],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("rehearsal stake transfer reverted");
      return hash;
    },
    resolvePayer: async () => "0.0.0",
    discardAuth: discardPaymentAuthorization,
    doPayout: payout,
    doSlash: slash,
    writeFeedback: async () => `mock:${crypto.randomUUID()}`,
    provision: async () => ({ agentId: "rehearsal", address: "0x0", accountId: "0.0.0" }),
    fundAgent: ensureAgentUsdc,
    isSettled: isAttemptSettled,
    guards: realSpendGuards,
  } as SubmitDeps;
}

async function main(): Promise<void> {
  await initSchema();
  await seedTargets();

  const reuseId = process.env.REHEARSAL_AGENT_ID;
  let agentId: string;
  let wallet: { privateKey: `0x${string}`; address: `0x${string}` };
  if (reuseId) {
    const existing = await getAgent(reuseId);
    if (!existing) throw new Error(`REHEARSAL_AGENT_ID ${reuseId} not found`);
    agentId = existing.id;
    wallet = {
      privateKey: decryptPrivateKey(existing.encryptedPrivateKey, serverConfig.serverWalletSecret) as `0x${string}`,
      address: existing.walletAddress as `0x${string}`,
    };
  } else {
    const fresh = generateAgentWallet();
    agentId = await insertAgent({
      label: `rehearsal-${Date.now()}`,
      walletAddress: fresh.address,
      encryptedPrivateKey: encryptPrivateKey(fresh.privateKey, serverConfig.serverWalletSecret),
      erc8004TokenId: "mock-id:rehearsal",
    });
    wallet = fresh;
  }
  log("agent", { agentId, address: wallet.address, reused: Boolean(reuseId) });

  const deps = stakeTransferDeps(wallet.privateKey);
  const arena = serverConfig.arenaAddress;
  const results: Array<Record<string, unknown>> = [];

  const scenarios = (process.env.REHEARSAL_SCENARIOS ?? "INVALID,VALID").split(",") as Array<"INVALID" | "VALID">;
  for (const scenario of scenarios) {
    const calls =
      scenario === "VALID"
        ? [
            { caller: wallet.address, entryPoint: "setOwner", args: { newOwner: wallet.address } },
            { caller: wallet.address, entryPoint: "withdrawAll", args: {} },
          ]
        : [{ caller: wallet.address, entryPoint: "setOwner", args: { newOwner: wallet.address } }];

    invalidatePool(TARGET);
    const poolBefore = await getPool(TARGET);
    const arenaBefore = await tokenBalance(arena);
    const agentBefore = await tokenBalance(wallet.address as Address);

    const result = await runSubmit(agentId, TARGET, calls, undefined, deps);

    invalidatePool(TARGET);
    const poolAfter = await getPool(TARGET);
    const arenaAfter = await tokenBalance(arena);
    const agentAfter = await tokenBalance(wallet.address as Address);
    const attempt = await getSubmissionAttempt(result.attemptId);

    results.push({
      scenario,
      verdict: result.verdict,
      attemptId: result.attemptId,
      phase: attempt?.phase,
      exploitTxHash: result.exploitTxHash,
      settlementTxHash: result.settlementTxHash,
      poolDelta: (poolAfter - poolBefore).toString(),
      arenaTokenDelta: (arenaAfter - arenaBefore).toString(),
      agentTokenDelta: (agentAfter - agentBefore).toString(),
      poolMatchesArenaBalance: poolAfter - poolBefore === arenaAfter - arenaBefore,
    });
    log("scenario-complete", results[results.length - 1]);
  }

  const invalid = results.find((r) => r.scenario === "INVALID");
  const valid = results.find((r) => r.scenario === "VALID");
  const bounty = BigInt(getTargetMeta(TARGET)!.bountyAmount);
  const payoutAmount = STAKE + bounty;
  const checks: Array<readonly [string, boolean]> = [];
  if (invalid) {
    checks.push(
      ["INVALID verdict", invalid.verdict === "INVALID"],
      ["INVALID attempt completed", invalid.phase === "completed"],
      ["INVALID grows the pool by the stake", invalid.poolDelta === STAKE.toString()],
      ["INVALID stake reached the Arena", invalid.arenaTokenDelta === STAKE.toString()],
      ["INVALID leaves the agent with no stake", invalid.agentTokenDelta === "0"],
      ["INVALID pool tracks the Arena balance", invalid.poolMatchesArenaBalance === true]
    );
  }
  if (valid) {
    checks.push(
      ["VALID verdict", valid.verdict === "VALID"],
      ["VALID attempt completed", valid.phase === "completed"],
      ["VALID debits the whole payout", valid.poolDelta === (-payoutAmount).toString()],
      ["VALID moves the whole payout out of the Arena", valid.arenaTokenDelta === (-payoutAmount).toString()],
      ["VALID pays the agent stake plus bounty", valid.agentTokenDelta === (STAKE + payoutAmount).toString()],
      ["VALID pool tracks the Arena balance", valid.poolMatchesArenaBalance === true]
    );
  }
  if (invalid && valid) {
    checks.push(["fresh target per submission", invalid.exploitTxHash !== valid.exploitTxHash]);
  }

  for (const [name, ok] of checks) log("check", { name, ok });
  const failed = checks.filter(([, ok]) => !ok);
  log("rehearsal-summary", { passed: checks.length - failed.length, failed: failed.length });
  if (failed.length) process.exit(1);
}

await main();
