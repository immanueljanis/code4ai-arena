import { beforeAll, describe, expect, it } from "bun:test";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS = "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0";
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

const [{ initSchema }, { seedTargets }] = await Promise.all([
  import("../src/db.ts"),
  import("../src/contests.ts"),
]);
const { insertAgent, listSubmissions } = await import("../src/db.ts");
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

function mockDeps(verdict: "VALID" | "INVALID") {
  return {
    verify: async () => ({ verdict, exploitTxHash: "0x" + "11".repeat(32) }),
    settleAuth: async () => "0x" + "22".repeat(32),
    discardAuth: () => {},
    doPayout: async () => "0x" + "55".repeat(32),
    doSlash: async () => "0x" + "44".repeat(32),
    writeFeedback: async () => "0x" + "33".repeat(32),
    signAuth: async () => x402Auth,
    verifyAuth: async () => ({ payer: "0.0.4242", paymentDigest: "sha256:test-digest" }),
    resolvePayer: async () => "0.0.4242",
    fundAgent: async () => null,
  } as SubmitDeps;
}

describe("runSubmit — INVALID verdict", () => {
  it("settles the stake, slashes, persists INVALID submission", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "inv-agent",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:inv",
    });

    const deps = mockDeps("INVALID");
    const result = await runSubmit(agentId, "access-control-vault", [], undefined, deps);

    expect(result.verdict).toBe("INVALID");
    expect(result.exploitTxHash).toBe("0x" + "11".repeat(32));
    expect(result.settlementTxHash).toBe("0x" + "22".repeat(32));
    expect(result.reputationTxHash).toBe("0x" + "33".repeat(32));

    const subs = await listSubmissions(10);
    const mine = subs.find((s) => s.id === result.submissionId);
    expect(mine).toBeDefined();
    expect(mine!.verdict).toBe("INVALID");
    expect(mine!.settlementTxHash).toBe("0x" + "22".repeat(32));
  }, 30000);

  it("binds settlement and slash to one attempt id and the verified digest", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "attempt-binding",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:attempt",
    });

    const settleCalls: unknown[][] = [];
    const slashCalls: unknown[][] = [];
    const deps = {
      ...mockDeps("INVALID"),
      settleAuth: async (...args: unknown[]) => {
        settleCalls.push(args);
        return "0x" + "22".repeat(32);
      },
      doSlash: async (...args: unknown[]) => {
        slashCalls.push(args);
        return "0x" + "44".repeat(32);
      },
    } as SubmitDeps;

    await runSubmit(agentId, "access-control-vault", [], undefined, deps);

    expect(settleCalls).toHaveLength(1);
    expect(slashCalls).toHaveLength(1);
    expect(settleCalls[0][2]).toBe("sha256:test-digest");
    const attemptId = settleCalls[0][1] as string;
    expect(attemptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(slashCalls[0][3]).toBe(attemptId);
  }, 30000);

  it("pins the settlement payer only for a client-supplied authorization", async () => {
    const settleCalls: unknown[][] = [];
    const deps = {
      ...mockDeps("INVALID"),
      settleAuth: async (...args: unknown[]) => {
        settleCalls.push(args);
        return "0x" + "22".repeat(32);
      },
    } as SubmitDeps;

    const custodyAgent = await insertAgent({
      label: "payer-custody",
      walletAddress: generateAgentWallet().address,
      encryptedPrivateKey: encryptPrivateKey(generateAgentWallet().privateKey, "test-secret"),
      erc8004TokenId: "mock-id:payer-custody",
    });
    await runSubmit(custodyAgent, "access-control-vault", [], undefined, deps);
    expect(settleCalls[0][3]).toBeUndefined();

    const clientAgent = await insertAgent({
      label: "payer-client",
      walletAddress: generateAgentWallet().address,
      encryptedPrivateKey: encryptPrivateKey(generateAgentWallet().privateKey, "test-secret"),
      erc8004TokenId: "mock-id:payer-client",
    });
    await runSubmit(clientAgent, "access-control-vault", [], x402Auth, deps);
    expect(settleCalls[1][3]).toBe("0.0.4242");
  }, 30000);

  it("rejects a mismatched client authorization before funding the agent", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "no-fund-on-bad-auth",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:no-fund",
    });

    let funded = 0;
    let verified = 0;
    const deps = {
      ...mockDeps("INVALID"),
      fundAgent: async () => {
        funded += 1;
        return null;
      },
      verifyAuth: async () => {
        verified += 1;
        return { payer: "0.0.4242", paymentDigest: "sha256:test-digest" };
      },
    } as SubmitDeps;
    const badAuth = { ...x402Auth, accepted: { ...x402Auth.accepted, amount: "9000000" } };

    let error: Error | undefined;
    try {
      await runSubmit(agentId, "access-control-vault", [], badAuth, deps);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toContain("stake");
    expect(funded).toBe(0);
    expect(verified).toBe(0);
  }, 30000);

  it("does not prove when the facilitator rejects the signed payment", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "verify-rejects",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:verify-rejects",
    });

    let proved = 0;
    const deps = {
      ...mockDeps("INVALID"),
      verifyAuth: async () => {
        throw Object.assign(new Error("x402 verify rejected the stake payment: payer_signature_invalid"), { status: 402 });
      },
      verify: async () => {
        proved += 1;
        return { verdict: "INVALID" as const, exploitTxHash: "0x" + "11".repeat(32) };
      },
    } as SubmitDeps;

    let error: Error | undefined;
    try {
      await runSubmit(agentId, "access-control-vault", [], undefined, deps);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toContain("payer_signature_invalid");
    expect(proved).toBe(0);
  }, 30000);
});

describe("runSubmit — validation", () => {
  it("throws 404 for an unknown agent", async () => {
    const deps = mockDeps("VALID");
    let error: Error | undefined;
    try {
      await runSubmit(
        "00000000-0000-0000-0000-000000000000",
        "access-control-vault",
        [],
        undefined,
        deps
      );
    } catch (e) {
      error = e as Error & { status?: number };
    }
    expect(error).toBeDefined();
    expect((error as Error & { status?: number }).status).toBe(404);
  });

  it("rejects an authorization whose payTo is not the Arena contract", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "bad-payto",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:bad-payto",
    });
    const badAuth = {
      ...x402Auth,
      accepted: {
        ...x402Auth.accepted,
        payTo: "0x0000000000000000000000000000000000000001",
      },
    };
    let error: Error | undefined;
    try {
      await runSubmit(agentId, "access-control-vault", [], badAuth, mockDeps("INVALID"));
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("payTo must be the Arena account");
  });

  it("rejects an authorization whose asset is not USDC", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "bad-asset",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:bad-asset",
    });
    const badAuth = {
      ...x402Auth,
      accepted: {
        ...x402Auth.accepted,
        asset: "0x0000000000000000000000000000000000000002",
      },
    };
    let error: Error | undefined;
    try {
      await runSubmit(agentId, "access-control-vault", [], badAuth, mockDeps("INVALID"));
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain("asset must be USDC");
  });
});
