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

beforeAll(async () => {
  await initSchema();
  await seedTargets();
});

const ATTACKER = "0xa11ce00000000000000000000000000000000000";

describe("POST /api/contests/:key/playground", () => {
  it("returns VALID for the access-control exploit", async () => {
    const res = await app.request("/api/contests/access-control-vault/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        exploitCalls: [
          { caller: ATTACKER, entryPoint: "setOwner", args: { newOwner: ATTACKER } },
          { caller: ATTACKER, entryPoint: "withdrawAll", args: {} },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict: string };
    expect(body.verdict).toBe("VALID");
  }, 30000);

  it("returns INVALID for empty calls", async () => {
    const res = await app.request("/api/contests/access-control-vault/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exploitCalls: [] }),
    });
    const body = (await res.json()) as { verdict: string };
    expect(body.verdict).toBe("INVALID");
  }, 30000);

  it("returns 400 for malformed body", async () => {
    const res = await app.request("/api/contests/access-control-vault/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown targets", async () => {
    const res = await app.request("/api/contests/not-a-target/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exploitCalls: [] }),
    });
    expect(res.status).toBe(404);
  });
});
