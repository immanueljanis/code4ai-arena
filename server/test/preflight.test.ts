import { describe, expect, it } from "bun:test";

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

const { runPreflight, MIN_GAS_HBAR } = await import("../scripts/preflight.ts");
import type { PreflightProbes } from "../scripts/preflight.ts";

const WEI_PER_HBAR = 10n ** 18n;

function probes(overrides: Partial<PreflightProbes> = {}): PreflightProbes {
  return {
    chainId: async () => 296,
    gasBalanceWei: async () => 9n * WEI_PER_HBAR,
    bytecodeSize: async () => 4096,
    tokenDecimals: async () => 6,
    facilitatorHealthy: async () => true,
    ...overrides,
  };
}

const byName = (checks: Awaited<ReturnType<typeof runPreflight>>, name: string) =>
  checks.find((check) => check.name === name)!;

describe("live preflight", () => {
  it("passes every check on a healthy testnet setup", async () => {
    const checks = await runPreflight(probes());
    expect(checks.map((c) => c.name)).toEqual([
      "chain-id",
      "gas-budget",
      "settlement-token",
      "arena-deployed",
      "facilitator",
    ]);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("fails when the RPC is not Hedera testnet", async () => {
    const checks = await runPreflight(probes({ chainId: async () => 295 }));
    expect(byName(checks, "chain-id").ok).toBe(false);
    expect(byName(checks, "chain-id").detail).toContain("296");
  });

  it("fails when the operator cannot cover gas", async () => {
    const checks = await runPreflight(
      probes({ gasBalanceWei: async () => BigInt(MIN_GAS_HBAR) * WEI_PER_HBAR - 1n })
    );
    expect(byName(checks, "gas-budget").ok).toBe(false);
  });

  it("passes at exactly the minimum gas budget", async () => {
    const checks = await runPreflight(
      probes({ gasBalanceWei: async () => BigInt(MIN_GAS_HBAR) * WEI_PER_HBAR })
    );
    expect(byName(checks, "gas-budget").ok).toBe(true);
  });

  it("fails when the settlement token is not six decimals or is missing", async () => {
    for (const decimals of [8, 0, undefined]) {
      const checks = await runPreflight(probes({ tokenDecimals: async () => decimals }));
      expect(byName(checks, "settlement-token").ok).toBe(false);
    }
  });

  it("fails when the configured Arena address has no code", async () => {
    const checks = await runPreflight(probes({ bytecodeSize: async () => 0 }));
    expect(byName(checks, "arena-deployed").ok).toBe(false);
  });

  it("fails when the facilitator is unreachable", async () => {
    const checks = await runPreflight(probes({ facilitatorHealthy: async () => false }));
    expect(byName(checks, "facilitator").ok).toBe(false);
  });

  it("treats a throwing probe as a failed check rather than a crash", async () => {
    const checks = await runPreflight(
      probes({
        chainId: async () => {
          throw new Error("rpc unreachable");
        },
      })
    );
    expect(byName(checks, "chain-id")).toMatchObject({ ok: false, detail: "rpc unreachable" });
    expect(byName(checks, "gas-budget").ok).toBe(true);
  });

  it("reports the active settlement profile symbol in the token check", async () => {
    const checks = await runPreflight(probes());
    expect(byName(checks, "settlement-token").detail).toContain("USDC");
    expect(byName(checks, "settlement-token").detail).toContain("0.0.429274");
  });
});
