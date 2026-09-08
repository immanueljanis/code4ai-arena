import { describe, expect, it } from "bun:test";
import { loadConfig } from "../src/config.ts";

const validEnv = {
  HEDERA_TESTNET_RPC_URL: "https://testnet.hashio.io/api",
  HEDERA_USDC_TESTNET_ADDRESS: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  ARENA_ADDRESS: "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0",
  ACCESS_CONTROL_VAULT_ADDRESS: "0x73524775e7c01E862F8d0E381D1154d7939cC160",
  ROUNDING_VAULT_ADDRESS: "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A",
  TIME_WINDOW_VAULT_ADDRESS: "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd",
  VERIFIER_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  SERVER_WALLET_SECRET: "test-secret-please-change",
} as Record<string, string>;

describe("loadConfig", () => {
  it("parses all addresses and chain constants from a valid env", () => {
    const cfg = loadConfig(validEnv);

    expect(cfg.chainId).toBe(296);
    expect(cfg.rpcUrl).toBe("https://testnet.hashio.io/api");
    expect(cfg.usdcAddress).toBe("0x534b2f3A21130d7a60830c2Df862319e593943A3");
    expect(cfg.arenaAddress).toBe("0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0");
    expect(cfg.vaultAddresses.accessControl).toBe(
      "0x73524775e7c01E862F8d0E381D1154d7939cC160"
    );
    expect(cfg.vaultAddresses.rounding).toBe(
      "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A"
    );
    expect(cfg.vaultAddresses.timeWindow).toBe(
      "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd"
    );
    expect(cfg.verifierKey).toBe(validEnv.VERIFIER_KEY);
    expect(cfg.x402FacilitatorUrl).toBe("https://facilitator.blockydevs.com");
    expect(cfg.erc8004MainnetKey).toBeUndefined();
  });

  it("throws when a required env var is missing", () => {
    const { ARENA_ADDRESS: _drop, ...missing } = validEnv;
    expect(() => loadConfig(missing)).toThrow(/ARENA_ADDRESS/);
  });

  it("throws on a malformed address", () => {
    expect(() =>
      loadConfig({ ...validEnv, ARENA_ADDRESS: "0xnot-an-address" })
    ).toThrow(/ARENA_ADDRESS/);
  });

  it("throws on a malformed private key", () => {
    expect(() =>
      loadConfig({ ...validEnv, VERIFIER_KEY: "not-a-key" })
    ).toThrow(/VERIFIER_KEY/);
  });
});
