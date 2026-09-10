import { describe, expect, it } from "bun:test";
import { runPlaygroundVerification } from "../src/verifier-local.ts";

// serverConfig (used for the deploy beneficiary) is lazy — set env before first call.
process.env.HEDERA_TESTNET_RPC_URL = "http://127.0.0.1:8545";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
process.env.ARENA_ADDRESS = "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.SERVER_WALLET_SECRET = "test-secret";

const ATTACKER = "0xa11ce00000000000000000000000000000000000";
const OTHER = "0xb0b0000000000000000000000000000000000000";

describe("runPlaygroundVerification", () => {
  it("returns VALID when the exploit breaks the invariant (access-control-vault)", async () => {
    const verdict = await runPlaygroundVerification("access-control-vault", [
      { caller: ATTACKER, entryPoint: "setOwner", args: { newOwner: ATTACKER } },
      { caller: ATTACKER, entryPoint: "withdrawAll", args: {} },
    ]);
    expect(verdict).toBe("VALID");
  }, 30000);

  it("returns INVALID for empty calls", async () => {
    const verdict = await runPlaygroundVerification("access-control-vault", []);
    expect(verdict).toBe("INVALID");
  }, 30000);

  it("returns VALID for the rounding-vault first-depositor exploit", async () => {
    const verdict = await runPlaygroundVerification("rounding-vault", [
      { caller: ATTACKER, entryPoint: "deposit", args: {} },
      { caller: ATTACKER, entryPoint: "donate", args: { amount: 1_000_000 } },
      { caller: OTHER, entryPoint: "deposit", args: {} },
      { caller: ATTACKER, entryPoint: "transferShares", args: { to: OTHER, shareCount: 100 } },
      { caller: ATTACKER, entryPoint: "transferShares", args: { to: OTHER, shareCount: 200 } },
      { caller: ATTACKER, entryPoint: "withdraw", args: { shareCount: 700 } },
    ]);
    expect(verdict).toBe("VALID");
  }, 30000);

  it("returns VALID for the reentrancy-vault callback exploit", async () => {
    const verdict = await runPlaygroundVerification("reentrancy-vault", [
      { caller: ATTACKER, entryPoint: "deposit", args: {} },
      { caller: ATTACKER, entryPoint: "armSelfReentry", args: {} },
      { caller: ATTACKER, entryPoint: "withdraw", args: { amount: 1 } },
    ]);
    expect(verdict).toBe("VALID");
  }, 30000);

  it("returns VALID for the time-window exploit using waitBlocks (anvil mines instantly)", async () => {
    // The playground deploys TimeWindowVault with the anvil dev account as
    // beneficiary — claims must come from that address.
    const beneficiary = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const verdict = await runPlaygroundVerification("time-window-vault", [
      { caller: beneficiary, entryPoint: "claim", args: { amount: 100e6 }, waitBlocks: 60 },
      { caller: beneficiary, entryPoint: "claim", args: { amount: 100e6 } },
    ]);
    expect(verdict).toBe("VALID");
  }, 30000);
});
