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

const [{ app }, { initSchema }, { seedTargets }] = await Promise.all([
  import("../src/index.ts"),
  import("../src/db.ts"),
  import("../src/contests.ts"),
]);
const { insertAgent, insertSubmission } = await import("../src/db.ts");

beforeAll(async () => {
  await initSchema();
  await seedTargets();
});

describe("GET /api/state", () => {
  it("returns submissions newest-first with tx hashes and targets with pools", async () => {
    const agentId = await insertAgent({
      label: "state-agent",
      walletAddress: "0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496",
      encryptedPrivateKey: "aGVsbG8=",
      erc8004TokenId: "mock-id:state",
    });
    await insertSubmission({
      agentId,
      targetKey: "access-control-vault",
      mode: "real",
      exploitCalls: [],
      verdict: "INVALID",
      exploitTxHash: "0x" + "aa".repeat(32),
      settlementTxHash: "0x" + "bb".repeat(32),
      reputationTxHash: "0x" + "cc".repeat(32),
    });

    const res = await app.request("/api/state");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      submissions: {
        id: string;
        targetKey: string;
        verdict: string | null;
        mode: string;
        exploitTxHash: string | null;
        settlementTxHash: string | null;
        reputationTxHash: string | null;
        createdAt: string;
      }[];
      targets: {
        key: string;
        objective: string;
        invariantCount: number;
        stakeAmount: number;
        poolRemaining: string;
      }[];
    };

    expect(body.targets.length).toBeGreaterThanOrEqual(3);
    const acv = body.targets.find((t) => t.key === "access-control-vault");
    expect(acv).toBeDefined();
    expect(acv!.poolRemaining).toMatch(/^\d+$/);

    expect(body.submissions.length).toBeGreaterThan(0);
    const first = body.submissions[0];
    expect(first.targetKey).toBe("access-control-vault");
    expect(first.exploitTxHash).toMatch(/^0x/);
    expect(first.settlementTxHash).toMatch(/^0x/);
    expect(first.reputationTxHash).toMatch(/^0x/);
    expect(new Date(first.createdAt).getTime()).not.toBeNaN();

    // Newest-first ordering.
    for (let i = 1; i < body.submissions.length; i++) {
      expect(
        new Date(body.submissions[i - 1].createdAt).getTime()
      ).toBeGreaterThanOrEqual(new Date(body.submissions[i].createdAt).getTime());
    }
  });

  it("never leaks invariant text or ids", async () => {
    const res = await app.request("/api/state");
    const text = await res.text();
    expect(text).not.toContain("balance-preserved");
    expect(text).not.toContain("invariantHolds");
  });
});
