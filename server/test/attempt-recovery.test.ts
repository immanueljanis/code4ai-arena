import { beforeAll, describe, expect, it } from "bun:test";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS =
  process.env.REHEARSAL_ARENA_ADDRESS ?? "0x5928df319b3D062203D6aF33A6797df4a96b18a4";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.SERVER_WALLET_SECRET = "test-secret";
// Pin the canonical profile: a developer .env running demo-hts must not change
// what these assertions mean.
process.env.SETTLEMENT_PROFILE = "usdc";
process.env.HEDERA_USDC_TESTNET_ID = "0.0.429274";
process.env.X402_FACILITATOR_URL = "https://api.testnet.blocky402.com";
process.env.X402_FACILITATOR_ACCOUNT_ID = "0.0.7162784";
process.env.X402_SETTLEMENT_SECRET = "";
process.env.DEMO_HTS_TOKEN_ID = "";
process.env.DEMO_HTS_TOKEN_ADDRESS = "";
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai_test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { initSchema, insertAgent, getSubmissionAttempt } = await import("../src/db.ts");
const { seedTargets } = await import("../src/contests.ts");
const { runSubmit } = await import("../src/agentRunner.ts");
const { encryptPrivateKey, generateAgentWallet } = await import("../src/wallet.ts");
import type { SubmitDeps } from "../src/agentRunner.ts";

beforeAll(async () => {
  await initSchema();
  await seedTargets();
});

const x402Auth = {
  x402Version: 2 as const,
  payload: { transaction: "dGVzdC10cmFuc2FjdGlvbg==" },
  accepted: {
    scheme: "exact",
    network: "hedera:testnet",
    amount: "1000000",
    asset: "0.0.429274",
    payTo: "0.0.1234",
    maxTimeoutSeconds: 300,
    extra: { feePayer: "0.0.7162784" },
  },
};

interface Counters {
  proved: number;
  settled: number;
  slashed: number;
  paid: number;
  feedback: number;
  funded: number;
}

interface Harness {
  deps: SubmitDeps;
  counters: Counters;
  settledOnChain: { value: boolean };
  crashAt: { phase: string | null };
}

/** Deps that record every external effect and can be made to crash at one of them. */
function harness(verdict: "VALID" | "INVALID"): Harness {
  const counters: Counters = { proved: 0, settled: 0, slashed: 0, paid: 0, feedback: 0, funded: 0 };
  const settledOnChain = { value: false };
  const crashAt: { phase: string | null } = { phase: null };
  const crash = (phase: string) => {
    if (crashAt.phase === phase) throw new Error(`crash at ${phase}`);
  };

  const deps = {
    fundAgent: async () => {
      counters.funded += 1;
      crash("fund");
      return null;
    },
    signAuth: async () => x402Auth,
    verifyAuth: async () => {
      crash("verify");
      return { payer: "0.0.4242", paymentDigest: "sha256:test-digest" };
    },
    resolvePayer: async () => "0.0.4242",
    verify: async () => {
      counters.proved += 1;
      crash("prove");
      return { verdict, exploitTxHash: "0x" + "11".repeat(32) };
    },
    isSettled: async () => settledOnChain.value,
    guards: { gasBalance: async () => 10n ** 19n, attemptCount: async () => 0 },
    discardAuth: async () => {},
    settleAuth: async () => {
      counters.settled += 1;
      crash("settle");
      return "0x" + "22".repeat(32);
    },
    doSlash: async () => {
      counters.slashed += 1;
      settledOnChain.value = true;
      crash("slash");
      return "0x" + "44".repeat(32);
    },
    doPayout: async () => {
      counters.paid += 1;
      settledOnChain.value = true;
      crash("payout");
      return "0x" + "55".repeat(32);
    },
    writeFeedback: async () => {
      counters.feedback += 1;
      crash("feedback");
      return "0x" + "33".repeat(32);
    },
  } as SubmitDeps;

  return { deps, counters, settledOnChain, crashAt };
}

async function newAgent(label: string): Promise<string> {
  const wallet = generateAgentWallet();
  return insertAgent({
    label,
    walletAddress: wallet.address,
    encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
    erc8004TokenId: `mock-id:${label}`,
  });
}

async function attempt(run: () => Promise<unknown>): Promise<Error & { status?: number }> {
  try {
    await run();
    throw new Error("expected the run to fail");
  } catch (e) {
    return e as Error & { status?: number };
  }
}

const TARGET = "access-control-vault";

describe("crash recovery by phase", () => {
  it("resumes after a crash between payment and slash without paying twice", async () => {
    const agentId = await newAgent("crash-after-payment");
    const h = harness("INVALID");
    const key = `crash-settle-${crypto.randomUUID()}`;

    h.crashAt.phase = "slash";
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));
    expect(h.counters.settled).toBe(1);
    expect(h.counters.slashed).toBe(1);

    h.crashAt.phase = null;
    const resumed = await runSubmit(agentId, TARGET, [], undefined, h.deps, key);

    expect(resumed.verdict).toBe("INVALID");
    expect(h.counters.settled).toBe(1);
    expect(h.counters.proved).toBe(1);
    const journal = await getSubmissionAttempt(resumed.attemptId);
    expect(journal!.phase).toBe("completed");
  }, 30000);

  it("does not replay the payout when the chain already records the attempt", async () => {
    const agentId = await newAgent("crash-after-payout");
    const h = harness("VALID");
    const key = `crash-payout-${crypto.randomUUID()}`;

    h.crashAt.phase = "payout";
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));
    expect(h.counters.paid).toBe(1);
    expect(h.settledOnChain.value).toBe(true);

    h.crashAt.phase = null;
    const error = await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));

    expect(h.counters.paid).toBe(1);
    expect(error.message).toContain("already settled on-chain");
    expect(error.status).toBe(409);
  }, 30000);

  it("retries only reputation after a feedback crash, never the money legs", async () => {
    const agentId = await newAgent("crash-feedback");
    const h = harness("INVALID");
    const key = `crash-feedback-${crypto.randomUUID()}`;

    h.crashAt.phase = "feedback";
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));
    expect(h.counters.settled).toBe(1);
    expect(h.counters.slashed).toBe(1);
    const midway = await getSubmissionAttempt(
      (await getSubmissionAttemptIdFor(key, agentId)) as string
    );
    expect(midway!.phase).toBe("accounting_confirmed");

    h.crashAt.phase = null;
    const resumed = await runSubmit(agentId, TARGET, [], undefined, h.deps, key);

    expect(resumed.verdict).toBe("INVALID");
    expect(h.counters.settled).toBe(1);
    expect(h.counters.slashed).toBe(1);
    expect(h.counters.feedback).toBe(2);
    expect(resumed.settlementTxHash).toBe("0x" + "22".repeat(32));
  }, 30000);

  it("fails closed when interrupted before a verdict and never settles", async () => {
    const agentId = await newAgent("crash-proving");
    const h = harness("INVALID");
    const key = `crash-prove-${crypto.randomUUID()}`;

    h.crashAt.phase = "prove";
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));

    h.crashAt.phase = null;
    const error = await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));

    expect(error.status).toBe(409);
    expect(error.message).toContain("new Idempotency-Key");
    expect(h.counters.settled).toBe(0);
    expect(h.counters.slashed).toBe(0);
    expect(h.counters.paid).toBe(0);
  }, 30000);

  it("refuses to resume an attempt it already marked permanently failed", async () => {
    const agentId = await newAgent("terminal");
    const h = harness("INVALID");
    const key = `terminal-${crypto.randomUUID()}`;

    h.crashAt.phase = "prove";
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));
    h.crashAt.phase = null;
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));

    const error = await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));
    expect(error.message).toContain("failed permanently");
    expect(h.counters.settled).toBe(0);
  }, 30000);

  it("never funds or proves again once a verdict is journalled", async () => {
    const agentId = await newAgent("no-refund");
    const h = harness("INVALID");
    const key = `no-refund-${crypto.randomUUID()}`;

    h.crashAt.phase = "settle";
    await attempt(() => runSubmit(agentId, TARGET, [], undefined, h.deps, key));
    expect(h.counters.funded).toBe(1);
    expect(h.counters.proved).toBe(1);

    h.crashAt.phase = null;
    await runSubmit(agentId, TARGET, [], undefined, h.deps, key);

    expect(h.counters.funded).toBe(1);
    expect(h.counters.proved).toBe(1);
    expect(h.counters.settled).toBe(2);
  }, 30000);
});

async function getSubmissionAttemptIdFor(requestKey: string, agentId: string): Promise<string> {
  const { sql } = await import("../src/db.ts");
  const rows = await sql`
    SELECT id FROM submission_attempts WHERE request_key = ${requestKey} AND agent_id = ${agentId}
  `;
  return (rows[0] as { id: string }).id;
}
