import { describe, expect, it } from "bun:test";
import { createErc8004Client, mintIdentity, writeReputationFeedback } from "../src/erc8004.ts";

// serverConfig is lazy — set env before first call.
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
process.env.ERC8004_MAINNET_KEY = "";

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

describe("erc8004 mock mode (no ERC8004_MAINNET_KEY)", () => {
  it("mintIdentity returns a deterministic mock token id", async () => {
    const id = await mintIdentity("0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496");
    expect(id).toMatch(/^mock-id:/);
  });

  it("writeReputationFeedback returns a mock tx hash", async () => {
    const tx = await writeReputationFeedback("mock-id:1", "VALID");
    expect(tx).toMatch(/^0x[0-9a-f]{64}$/);
    const tx2 = await writeReputationFeedback("mock-id:1", "INVALID");
    expect(tx2).not.toBe(tx);
  });
});

describe("erc8004 real-mode client construction (key set)", () => {
  it("constructs a client bound to the mainnet registry addresses", async () => {
    const client = createErc8004Client("0x" + "11".repeat(32));
    expect(client.identityRegistry).toBe(IDENTITY_REGISTRY);
    expect(client.reputationRegistry).toBe(REPUTATION_REGISTRY);
    expect(client.chainId).toBe(143);
  });
});
