import { describe, expect, it } from "bun:test";
import { CHAIN_ID, loadConfig } from "../src/config.ts";

const address = "0x0000000000000000000000000000000000068cda";
const env: Record<string, string | undefined> = {
  HEDERA_TESTNET_RPC_URL: "https://testnet.hashio.io/api",
  HEDERA_USDC_TESTNET_ADDRESS: address,
  ARENA_ADDRESS: address,
  HEDERA_ARENA_ACCOUNT_ID: "0.0.1234",
  ACCESS_CONTROL_VAULT_ADDRESS: address,
  ROUNDING_VAULT_ADDRESS: address,
  TIME_WINDOW_VAULT_ADDRESS: address,
  VERIFIER_KEY: `0x${"1".repeat(64)}`,
  SERVER_WALLET_SECRET: "test-only",
};
const demo = {
  ...env,
  SETTLEMENT_PROFILE: "demo-hts",
  DEMO_HTS_TOKEN_ID: "0.0.1234567",
  X402_FACILITATOR_URL: "http://localhost:4020",
  X402_FACILITATOR_ACCOUNT_ID: "0.0.1235",
  X402_SETTLEMENT_SECRET: "test-settlement-secret",
};

describe("settlement profiles", () => {
  it("retains canonical defaults and explicit selection", () => {
    const config = loadConfig(env);
    expect(config).toMatchObject({
      chainId: 296,
      settlementProfile: "usdc",
      settlementSymbol: "USDC",
      settlementTokenId: "0.0.429274",
      settlementTokenAddress: address,
      settlementDecimals: 6,
      usdcAddress: address,
      hederaUsdcTokenId: "0.0.429274",
    });
    expect(loadConfig({ ...env, SETTLEMENT_PROFILE: "usdc" })).toEqual(config);
  });

  it("preserves legacy independent address and ID overrides", () => {
    const config = loadConfig({ ...env, HEDERA_USDC_TESTNET_ID: "0.0.1234" });
    expect(config.settlementTokenId).toBe("0.0.1234");
    expect(config.settlementTokenAddress).toBe(address);
    expect(() => loadConfig({ ...env, HEDERA_USDC_TESTNET_ADDRESS: undefined })).toThrow(/HEDERA_USDC_TESTNET_ADDRESS/);
  });

  it("derives demo identity without canonical configuration and updates aliases", () => {
    const config = loadConfig({ ...demo, HEDERA_USDC_TESTNET_ADDRESS: undefined });
    expect(CHAIN_ID).toBe(296);
    expect(config).toMatchObject({
      chainId: 296,
      settlementProfile: "demo-hts",
      settlementSymbol: "DemoUSD",
      settlementTokenId: "0.0.1234567",
      settlementTokenAddress: "0x000000000000000000000000000000000012d687",
      settlementDecimals: 6,
    });
    expect(config.usdcAddress).toBe(config.settlementTokenAddress);
    expect(config.hederaUsdcTokenId).toBe(config.settlementTokenId);
    expect(loadConfig(demo)).toEqual(config);
  });

  it("accepts a matching facade regardless of hex case", () => {
    expect(() => loadConfig({ ...demo, DEMO_HTS_TOKEN_ADDRESS: "0x000000000000000000000000000000000012D687" })).not.toThrow();
  });

  for (const value of [undefined, "", "0.0.0", "0.0.-1", "0.0.01", "1.0.1", "0.1.1", "0.0.1.2", "0.0.1x", " 0.0.1", "0.0.1\n", "0.0.9223372036854775808", `0.0.${"9".repeat(100)}`]) {
    it(`rejects invalid demo ID ${JSON.stringify(value)}`, () => {
      expect(() => loadConfig({ ...demo, DEMO_HTS_TOKEN_ID: value })).toThrow(/DEMO_HTS_TOKEN_ID/);
    });
  }

  it("handles token numbers beyond floating point precision exactly", () => {
    expect(loadConfig({ ...demo, DEMO_HTS_TOKEN_ID: "0.0.9223372036854775807" }).settlementTokenAddress)
      .toBe("0x0000000000000000000000007fffffffffffffff");
    expect(loadConfig({ ...demo, DEMO_HTS_TOKEN_ID: "0.0.1" }).settlementTokenAddress)
      .toBe("0x0000000000000000000000000000000000000001");
  });

  it("treats an empty optional facade as unset", () => {
    expect(loadConfig({ ...demo, DEMO_HTS_TOKEN_ADDRESS: "" })).toEqual(loadConfig(demo));
  });

  for (const suffix of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    it(`rejects a demo ID ending in ${JSON.stringify(suffix)}`, () => {
      expect(() => loadConfig({ ...demo, DEMO_HTS_TOKEN_ID: `0.0.1234567${suffix}` }))
        .toThrow(/DEMO_HTS_TOKEN_ID/);
    });
  }

  for (const value of [address, "not-an-address", "   "]) {
    it(`rejects conflicting or malformed facade ${JSON.stringify(value)}`, () => {
      expect(() => loadConfig({ ...demo, DEMO_HTS_TOKEN_ADDRESS: value })).toThrow(/DEMO_HTS_TOKEN_ADDRESS/);
    });
  }

  it("fixes demo decimals at six", () => {
    expect(loadConfig({ ...demo, DEMO_HTS_TOKEN_DECIMALS: "6" }).settlementDecimals).toBe(6);
    for (const value of ["", "18", "6.0", "-6"]) {
      expect(() => loadConfig({ ...demo, DEMO_HTS_TOKEN_DECIMALS: value })).toThrow(/DEMO_HTS_TOKEN_DECIMALS/);
    }
  });

  it("uses explicitly configured demo facilitator settings", () => {
    expect(loadConfig(demo)).toMatchObject({
      x402FacilitatorUrl: demo.X402_FACILITATOR_URL,
      hederaFacilitatorAccountId: demo.X402_FACILITATOR_ACCOUNT_ID,
    });
  });

  for (const value of ["http://localhost:4020", "https://facilitator.example/settlement"]) {
    it(`accepts facilitator URL ${value}`, () => {
      expect(loadConfig({ ...demo, X402_FACILITATOR_URL: value }).x402FacilitatorUrl).toBe(value);
    });
  }

  for (const value of ["not-a-url", "/settle", "https://", "http://[invalid", "ftp://facilitator.example", "file:///settle"]) {
    it(`rejects invalid facilitator URL ${value}`, () => {
      expect(() => loadConfig({ ...demo, X402_FACILITATOR_URL: value })).toThrow(/X402_FACILITATOR_URL/);
    });
  }

  for (const key of ["X402_FACILITATOR_URL", "X402_FACILITATOR_ACCOUNT_ID"]) {
    for (const value of [undefined, "", "   "]) {
      it(`requires explicit ${key} for demo with ${JSON.stringify(value)}`, () => {
        expect(() => loadConfig({ ...demo, [key]: value })).toThrow(key);
      });
    }
  }

  it("requires a settlement secret for the self-hosted facilitator", () => {
    expect(() => loadConfig({ ...demo, X402_SETTLEMENT_SECRET: undefined })).toThrow(/X402_SETTLEMENT_SECRET/);
    expect(() => loadConfig({ ...demo, X402_SETTLEMENT_SECRET: "   " })).toThrow(/X402_SETTLEMENT_SECRET/);
    expect(loadConfig(demo).x402SettlementSecret).toBe("test-settlement-secret");
    expect(loadConfig(env).x402SettlementSecret).toBeUndefined();
  });

  it("rejects a malformed explicit facilitator account", () => {
    expect(() => loadConfig({ ...demo, X402_FACILITATOR_ACCOUNT_ID: "invalid" }))
      .toThrow(/X402_FACILITATOR_ACCOUNT_ID/);
  });

  for (const value of ["", "demo", "USDC"]) {
    it(`rejects unknown profile ${JSON.stringify(value)}`, () => {
      expect(() => loadConfig({ ...env, SETTLEMENT_PROFILE: value })).toThrow(/SETTLEMENT_PROFILE/);
    });
  }
});
