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
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const [{ app }, { initSchema }, { seedTargets, getTargetByKey }] = await Promise.all([
  import("../src/index.ts"),
  import("../src/db.ts"),
  import("../src/contests.ts"),
]);

beforeAll(async () => {
  await initSchema();
  await seedTargets();
});

describe("GET /api/contests", () => {
  it("lists targets with invariant count, stake and live pool", async () => {
    const res = await app.request("/api/contests");
    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      key: string;
      objective: string;
      invariantCount: number;
      stakeAmount: number;
      poolRemaining: string;
    }[];

    expect(list.length).toBeGreaterThanOrEqual(3);
    const acv = list.find((t) => t.key === "access-control-vault");
    expect(acv).toBeDefined();
    expect(acv!.invariantCount).toBeGreaterThan(0);
    expect(acv!.objective).toBeTruthy();
  });

  it("never leaks invariant text or ids", async () => {
    const res = await app.request("/api/contests");
    const text = await res.text();
    expect(text).not.toContain("INITIAL_BALANCE");
    expect(text).not.toContain("invariantHolds");
    expect(text).not.toContain("balance == ");
    expect(text).not.toContain("balance-preserved");
  });
});

describe("GET /api/contests/:key", () => {
  it("returns source code for access-control-vault", async () => {
    const res = await app.request("/api/contests/access-control-vault");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; source: string; objective: string };
    expect(body.key).toBe("access-control-vault");
    expect(body.source).toContain("contract AccessControlVault");
    expect(body.source).toContain("invariantHolds");
    expect(body.objective).toBeTruthy();
  });

  it("returns 404 for unknown keys", async () => {
    const res = await app.request("/api/contests/not-a-target");
    expect(res.status).toBe(404);
  });

  it("serves the raw contract source but never a test/reference file", async () => {
    const res = await app.request("/api/contests/rounding-vault");
    const body = (await res.json()) as { source: string };
    expect(body.source).toContain("contract RoundingVault");
    // R8: test files (which contain the reference exploit + walkthrough) are
    // never served — the source endpoint maps key → the contract file only.
    expect(body.source).not.toContain("contract RoundingVaultTest");
    expect(body.source).not.toContain("test_exploitBreaksInvariant");
  });
});
