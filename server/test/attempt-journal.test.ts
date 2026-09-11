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
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { initSchema, getSubmissionAttempt, insertAgent } = await import("../src/db.ts");
const { seedTargets } = await import("../src/contests.ts");
const { runSubmit, requestDigest } = await import("../src/agentRunner.ts");
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
  settled: number;
  slashed: number;
  paid: number;
  proved: number;
}

function countingDeps(verdict: "VALID" | "INVALID"): { deps: SubmitDeps; counters: Counters } {
  const counters: Counters = { settled: 0, slashed: 0, paid: 0, proved: 0 };
  const deps = {
    verify: async () => {
      counters.proved += 1;
      return { verdict, exploitTxHash: "0x" + "11".repeat(32) };
    },
    signAuth: async () => x402Auth,
    verifyAuth: async () => ({ payer: "0.0.4242", paymentDigest: "sha256:test-digest" }),
    resolvePayer: async () => "0.0.4242",
    isSettled: async () => false,
    guards: { gasBalance: async () => 10n ** 19n, attemptCount: async () => 0 },
    settleAuth: async () => {
      counters.settled += 1;
      return "0x" + "22".repeat(32);
    },
    discardAuth: () => {},
    doPayout: async () => {
      counters.paid += 1;
      return "0x" + "55".repeat(32);
    },
    doSlash: async () => {
      counters.slashed += 1;
      return "0x" + "44".repeat(32);
    },
    writeFeedback: async () => "0x" + "33".repeat(32),
    fundAgent: async () => null,
  } as SubmitDeps;
  return { deps, counters };
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

describe("submission attempt journal", () => {
  it("records a completed attempt with the settlement receipts", async () => {
    const agentId = await newAgent("journal-complete");
    const { deps } = countingDeps("INVALID");
    const result = await runSubmit(agentId, "access-control-vault", [], undefined, deps);

    const attempt = await getSubmissionAttempt(result.attemptId);
    expect(attempt).toBeDefined();
    expect(attempt!.phase).toBe("completed");
    expect(attempt!.verdict).toBe("INVALID");
    expect(attempt!.submissionId).toBe(result.submissionId);
    expect(attempt!.exploitReceipt).toBe("0x" + "11".repeat(32));
    expect(attempt!.settlementReceipt).toBe("0x" + "22".repeat(32));
    expect(attempt!.reputationReceipt).toBe("0x" + "33".repeat(32));
    expect(attempt!.requestKey).toBeNull();
  }, 30000);

  it("stores the payment authorization encrypted rather than in the clear", async () => {
    const agentId = await newAgent("journal-secrecy");
    const { deps } = countingDeps("INVALID");
    const result = await runSubmit(agentId, "access-control-vault", [], x402Auth, deps);

    const attempt = await getSubmissionAttempt(result.attemptId);
    expect(attempt!.paymentAuthorization).toBeTruthy();
    expect(attempt!.paymentAuthorization).not.toContain(x402Auth.payload.transaction);
    const { decryptPrivateKey } = await import("../src/wallet.ts");
    expect(JSON.parse(decryptPrivateKey(attempt!.paymentAuthorization!, "test-secret"))).toEqual(
      x402Auth
    );
  }, 30000);

  it("replays a completed keyed attempt without paying or proving twice", async () => {
    const agentId = await newAgent("journal-replay");
    const { deps, counters } = countingDeps("INVALID");
    const key = `retry-${crypto.randomUUID()}`;

    const first = await runSubmit(agentId, "access-control-vault", [], undefined, deps, key);
    const second = await runSubmit(agentId, "access-control-vault", [], undefined, deps, key);

    expect(second).toEqual(first);
    expect(counters.proved).toBe(1);
    expect(counters.settled).toBe(1);
    expect(counters.slashed).toBe(1);
  }, 30000);

  it("rejects a reused key that carries a different request", async () => {
    const agentId = await newAgent("journal-conflict");
    const { deps, counters } = countingDeps("INVALID");
    const key = `conflict-${crypto.randomUUID()}`;

    await runSubmit(agentId, "access-control-vault", [], undefined, deps, key);

    let error: (Error & { status?: number }) | undefined;
    try {
      await runSubmit(
        agentId,
        "access-control-vault",
        [{ caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "setOwner", args: {} }],
        undefined,
        deps,
        key
      );
    } catch (e) {
      error = e as Error & { status?: number };
    }
    expect(error?.status).toBe(409);
    expect(counters.proved).toBe(1);
    expect(counters.settled).toBe(1);
  }, 30000);

  it("treats a repeat request without a key as a new attempt", async () => {
    const agentId = await newAgent("journal-legacy");
    const { deps, counters } = countingDeps("INVALID");

    const first = await runSubmit(agentId, "access-control-vault", [], undefined, deps);
    const second = await runSubmit(agentId, "access-control-vault", [], undefined, deps);

    expect(second.attemptId).not.toBe(first.attemptId);
    expect(counters.proved).toBe(2);
    expect(counters.settled).toBe(2);
  }, 30000);

  it("lets only one concurrent keyed request do the work", async () => {
    const agentId = await newAgent("journal-concurrent");
    const { deps, counters } = countingDeps("INVALID");
    const key = `concurrent-${crypto.randomUUID()}`;

    const outcomes = await Promise.allSettled([
      runSubmit(agentId, "access-control-vault", [], undefined, deps, key),
      runSubmit(agentId, "access-control-vault", [], undefined, deps, key),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(counters.proved).toBe(1);
    expect(counters.settled).toBe(1);
    expect(counters.slashed).toBe(1);
  }, 30000);

  it("digests the target, calls and supplied authorization", () => {
    const calls = [
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "setOwner", args: {} },
    ];
    expect(requestDigest("access-control-vault", calls)).toBe(
      requestDigest("access-control-vault", calls)
    );
    expect(requestDigest("access-control-vault", calls)).not.toBe(
      requestDigest("rounding-vault", calls)
    );
    expect(requestDigest("access-control-vault", calls)).not.toBe(
      requestDigest("access-control-vault", [])
    );
    expect(requestDigest("access-control-vault", calls)).not.toBe(
      requestDigest("access-control-vault", calls, x402Auth)
    );
  });
});
