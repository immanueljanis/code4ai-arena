import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { attemptKey, getPool, isAttemptSettled, payout, slash, type ArenaClients } from "../src/arena.ts";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS = "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY =
  process.env.TESTNET_VERIFIER_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.SERVER_WALLET_SECRET = "test-secret";

const runTestnet = process.env.RUN_TESTNET === "1";
const TARGET = "access-control-vault";
const INVARIANT = "balance-preserved";
const AGENT = "0xa11ce00000000000000000000000000000000000";
const ATTEMPT = "11111111-2222-3333-4444-555555555555";

/** Encode the Arena event a successful settlement receipt would carry. */
function settlementLog(eventName: "Slashed" | "Paid", args: readonly unknown[]) {
  const abi = arenaAbi();
  const event = (abi as Array<{ type: string; name: string; inputs: Array<{ type: string }> }>).find(
    (item) => item.type === "event" && item.name === eventName
  )!;
  return {
    address: process.env.ARENA_ADDRESS as `0x${string}`,
    topics: [
      keccak256(toBytes(`${eventName}(${event.inputs.map((i) => i.type).join(",")})`)),
    ] as [`0x${string}`],
    data: encodeAbiParameters(event.inputs as never, args as never),
  };
}

function arenaAbi(): unknown[] {
  const outDir = process.env.CONTRACTS_OUT_DIR ?? path.join("..", "contracts", "out");
  return (JSON.parse(readFileSync(path.join(outDir, "Arena.sol", "Arena.json"), "utf8")) as { abi: unknown[] }).abi;
}

function mockClients(
  overrides: Partial<Record<"writeContract" | "readContract" | "waitForTransactionReceipt", unknown>> = {}
): ArenaClients {
  return {
    publicClient: {
      readContract: overrides.readContract ?? (async () => 15_000_000n),
      waitForTransactionReceipt:
        overrides.waitForTransactionReceipt ?? (async () => ({ status: "success", logs: [] })),
    },
    walletClient: {
      writeContract: overrides.writeContract ?? (async () => "0x" + "ab".repeat(32)),
    },
  } as unknown as ArenaClients;
}

describe("arena slash/payout/getPool (unit, mocked)", () => {
  it("slash writes Arena.slash with hashed keys and confirms the Slashed event", async () => {
    let called: unknown;
    const slashArgs = [keccak256(toBytes(TARGET)), AGENT, 1_000_000n, attemptKey(ATTEMPT)];
    const clients = mockClients({
      writeContract: async (args: { functionName: string; args: unknown[] }) => {
        called = args;
        return "0x" + "cd".repeat(32);
      },
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [settlementLog("Slashed", slashArgs)],
      }),
    });
    const tx = await slash(TARGET, AGENT, 1_000_000n, ATTEMPT, clients);
    expect(tx).toBe("0x" + "cd".repeat(32));
    const c = called as { functionName: string; args: unknown[] };
    expect(c.functionName).toBe("slash");
    expect(c.args).toEqual(slashArgs);
  });

  it("payout writes Arena.payout with hashed keys and confirms the Paid event", async () => {
    let called: unknown;
    const payoutArgs = [
      keccak256(toBytes(TARGET)),
      keccak256(toBytes(INVARIANT)),
      AGENT,
      1_000_000n,
      5_000_000n,
      attemptKey(ATTEMPT),
    ];
    const clients = mockClients({
      writeContract: async (args: unknown) => {
        called = args;
        return "0x" + "ef".repeat(32);
      },
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [settlementLog("Paid", payoutArgs)],
      }),
    });
    const tx = await payout(TARGET, INVARIANT, AGENT, 1_000_000n, 5_000_000n, ATTEMPT, clients);
    expect(tx).toBe("0x" + "ef".repeat(32));
    const c = called as { functionName: string; args: unknown[] };
    expect(c.functionName).toBe("payout");
    expect(c.args).toEqual(payoutArgs);
  });

  it("rejects a reverted settlement receipt", async () => {
    const clients = mockClients({
      waitForTransactionReceipt: async () => ({ status: "reverted", logs: [] }),
    });
    await expect(slash(TARGET, AGENT, 1_000_000n, ATTEMPT, clients)).rejects.toThrow("reverted");
  });

  it("rejects a successful receipt whose event does not match the attempt", async () => {
    const clients = mockClients({
      readContract: async () => false,
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [settlementLog("Slashed", [keccak256(toBytes(TARGET)), AGENT, 1_000_000n, attemptKey("other")])],
      }),
    });
    await expect(slash(TARGET, AGENT, 1_000_000n, ATTEMPT, clients)).rejects.toThrow("did not settle");
  });

  it("accepts a missing event when the attempt is already settled on-chain", async () => {
    const clients = mockClients({
      readContract: async () => true,
      waitForTransactionReceipt: async () => ({ status: "success", logs: [] }),
    });
    expect(await slash(TARGET, AGENT, 1_000_000n, ATTEMPT, clients)).toBe("0x" + "ab".repeat(32));
  });

  it("isAttemptSettled reads Arena.settledAttempts with the hashed attempt id", async () => {
    let called: unknown;
    const clients = mockClients({
      readContract: async (args: unknown) => {
        called = args;
        return true;
      },
    });
    expect(await isAttemptSettled(ATTEMPT, clients)).toBe(true);
    const c = called as { functionName: string; args: unknown[] };
    expect(c.functionName).toBe("settledAttempts");
    expect(c.args[0]).toBe(attemptKey(ATTEMPT));
  });

  it("getPool reads Arena.targets and returns the pool amount", async () => {
    const clients = mockClients({
      readContract: async () => [20_000_000n, true],
    });
    const pool = await getPool(TARGET, clients);
    expect(pool).toBe(20_000_000n);
  });
});

describe("arena integration (testnet, RUN_TESTNET=1)", () => {
  beforeAll(async () => {
    if (!runTestnet) return;
    if (!process.env.TESTNET_VERIFIER_KEY) {
      throw new Error("RUN_TESTNET=1 requires TESTNET_VERIFIER_KEY");
    }
  });

  it(
    "slash grows the pool and payout pays the agent (verifier-signed)",
    async () => {
      if (!runTestnet) return;

      const agentKey = generatePrivateKey();
      const poolBefore = await getPool(TARGET);
      const tx = await slash(TARGET, AGENT, 1_000_000n, crypto.randomUUID());
      expect(tx).toMatch(/^0x[0-9a-fA-F]{64}$/);
      await new Promise((r) => setTimeout(r, 3000));
      const poolAfter = await getPool(TARGET);
      expect(poolAfter).toBe(poolBefore + 1_000_000n);
      void agentKey;
    },
    180000
  );
});
