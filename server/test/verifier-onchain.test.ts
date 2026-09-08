import { beforeAll, describe, expect, it } from "bun:test";
import { generatePrivateKey } from "viem/accounts";
import { runOnchainVerification } from "../src/verifier-onchain.ts";

// serverConfig is lazy — set env before first call.
process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
process.env.ARENA_ADDRESS = "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY = process.env.TESTNET_VERIFIER_KEY ?? "0xnotset";
process.env.SERVER_WALLET_SECRET = "test-secret";

const runTestnet = process.env.RUN_TESTNET === "1";

let agentKey: `0x${string}`;
let agentAddress: `0x${string}`;

beforeAll(async () => {
  if (!runTestnet) return;
  if (!process.env.TESTNET_VERIFIER_KEY) {
    throw new Error("RUN_TESTNET=1 requires TESTNET_VERIFIER_KEY (the funded deployer key)");
  }
  // Fresh random wallet per run — some testnet addresses (like anvil's defaults)
  // are already delegated (EIP-7702) and can't receive plain transfers.
  // Gas top-up (HBAR) happens inside runOnchainVerification.
  agentKey = generatePrivateKey();
  const { privateKeyToAccount } = await import("viem/accounts");
  agentAddress = privateKeyToAccount(agentKey).address;
});

describe("runOnchainVerification", () => {
  it(
    "returns VALID for the access-control exploit against a fresh testnet instance",
    async () => {
      if (!runTestnet) return; // integration — skipped unless RUN_TESTNET=1
      const { verdict, exploitTxHash } = await runOnchainVerification(
        "access-control-vault",
        [
          { caller: agentAddress!, entryPoint: "setOwner", args: { newOwner: agentAddress! } },
          { caller: agentAddress!, entryPoint: "withdrawAll", args: {} },
        ],
        agentKey!
      );
      expect(verdict).toBe("VALID");
      expect(exploitTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    },
    240000
  );

  it(
    "returns INVALID for empty calls against a fresh testnet instance",
    async () => {
      if (!runTestnet) return;
      const { verdict } = await runOnchainVerification("access-control-vault", [], agentKey!);
      expect(verdict).toBe("INVALID");
    },
    240000
  );

  it("rejects a call whose caller is not the agent wallet", async () => {
    if (!runTestnet) return;
    expect(
      runOnchainVerification(
        "access-control-vault",
        [
          {
            caller: "0xdead000000000000000000000000000000000000",
            entryPoint: "setOwner",
            args: {},
          },
        ],
        agentKey!
      )
    ).rejects.toThrow(/agent wallet/);
  });
});
