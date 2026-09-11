import { beforeAll, describe, expect, it } from "bun:test";
import { listSubmissions } from "../src/db.ts";

// serverConfig is lazy — set env before first call.
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

// db.ts reads DATABASE_URL at module load; app imports it transitively — so
// import both AFTER env is set.
const [{ app }, { initSchema }] = await Promise.all([
  import("../src/index.ts"),
  import("../src/db.ts"),
]);

beforeAll(async () => {
  await initSchema();
});

describe("POST /api/agents", () => {
  it("registers an agent with wallet + erc8004 token id", async () => {
    const res = await app.request("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "test-agent" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      label: string;
      walletAddress: string;
      encryptedPrivateKey?: string;
      erc8004TokenId: string;
    };
    expect(body.id).toBeTruthy();
    expect(body.label).toBe("test-agent");
    expect(body.walletAddress).toMatch(/^0x[0-9A-Fa-f]{40}$/);
    expect(body.erc8004TokenId).toMatch(/^mock-id:/);
    // Never expose the encrypted key or secret material.
    expect(body.encryptedPrivateKey).toBeUndefined();
  });

  it("returns 400 when label is missing", async () => {
    const res = await app.request("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
