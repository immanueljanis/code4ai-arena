import { describe, expect, test } from "bun:test";
import { loadFacilitatorConfig } from "../src/config.ts";

const env: Record<string, string | undefined> = {
  FACILITATOR_ACCOUNT_ID: "0.0.800",
  FACILITATOR_PRIVATE_KEY: "test-only-key-material",
  FACILITATOR_TOKEN_ID: "0.0.5555",
  FACILITATOR_STAKE_AMOUNT: "1000000",
  HEDERA_ARENA_ACCOUNT_ID: "0.0.2002",
  X402_SETTLEMENT_SECRET: "test-settlement-secret",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5440/code4ai",
};

describe("facilitator configuration", () => {
  test("builds a testnet policy from the required environment", () => {
    const config = loadFacilitatorConfig(env);
    expect(config.network).toBe("hedera:testnet");
    expect(config.port).toBe(4020);
    expect(config.policy).toMatchObject({
      tokenId: "0.0.5555",
      arenaAccountId: "0.0.2002",
      feePayerAccountId: "0.0.800",
      stakeAmount: "1000000",
      maxTimeoutSeconds: 300,
    });
    expect(config.policy.registeredAgentAccountId).toBeUndefined();
    expect(config.policy.allowedNodeAccountIds.length).toBeGreaterThan(0);
  });

  test("requires every secret and identity", () => {
    for (const key of [
      "FACILITATOR_ACCOUNT_ID",
      "FACILITATOR_PRIVATE_KEY",
      "FACILITATOR_TOKEN_ID",
      "FACILITATOR_STAKE_AMOUNT",
      "HEDERA_ARENA_ACCOUNT_ID",
      "X402_SETTLEMENT_SECRET",
      "DATABASE_URL",
    ]) {
      expect(() => loadFacilitatorConfig({ ...env, [key]: undefined })).toThrow(key);
      expect(() => loadFacilitatorConfig({ ...env, [key]: "   " })).toThrow(key);
    }
  });

  test("rejects a non testnet network", () => {
    expect(() => loadFacilitatorConfig({ ...env, HEDERA_NETWORK: "hedera:mainnet" })).toThrow(
      /HEDERA_NETWORK/
    );
  });

  test("rejects malformed Hedera identities without echoing their values", () => {
    for (const key of ["FACILITATOR_ACCOUNT_ID", "FACILITATOR_TOKEN_ID", "HEDERA_ARENA_ACCOUNT_ID"]) {
      const error = (() => {
        try {
          loadFacilitatorConfig({ ...env, [key]: "0xdeadbeef" });
          return undefined;
        } catch (e) {
          return e as Error;
        }
      })();
      expect(error?.message).toContain(key);
      expect(error?.message).not.toContain("0xdeadbeef");
    }
  });

  test("rejects a stake that is not a positive smallest-unit integer", () => {
    for (const stakeAmount of ["0", "-1", "1.5", "1e6", "abc"]) {
      expect(() => loadFacilitatorConfig({ ...env, FACILITATOR_STAKE_AMOUNT: stakeAmount })).toThrow(
        /FACILITATOR_STAKE_AMOUNT/
      );
    }
  });

  test("rejects a malformed node account allowlist", () => {
    expect(() =>
      loadFacilitatorConfig({ ...env, FACILITATOR_ALLOWED_NODE_ACCOUNT_IDS: "0.0.3,nope" })
    ).toThrow(/FACILITATOR_ALLOWED_NODE_ACCOUNT_IDS/);
    expect(
      loadFacilitatorConfig({ ...env, FACILITATOR_ALLOWED_NODE_ACCOUNT_IDS: "0.0.3, 0.0.4" }).policy
        .allowedNodeAccountIds
    ).toEqual(["0.0.3", "0.0.4"]);
  });

  test("never puts the fee payer key inside the policy it hands to the service", () => {
    const config = loadFacilitatorConfig(env);
    expect(JSON.stringify(config.policy)).not.toContain("test-only-key-material");
  });
});
