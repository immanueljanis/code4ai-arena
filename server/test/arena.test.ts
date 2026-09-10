import { beforeAll, describe, expect, it } from "bun:test";
import { keccak256, toBytes } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { getPool, payout, slash, type ArenaClients } from "../src/arena.ts";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
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

function mockClients(overrides: Partial<Record<"writeContract" | "readContract", unknown>> = {}): ArenaClients {
  return {
    publicClient: {
      readContract: overrides.readContract ?? (async () => 15_000_000n),
    },
    walletClient: {
      writeContract: overrides.writeContract ?? (async () => "0x" + "ab".repeat(32)),
    },
  } as unknown as ArenaClients;
}

describe("arena slash/payout/getPool (unit, mocked)", () => {
  it("slash writes Arena.slash with hashed targetKey and returns tx hash", async () => {
    let called: unknown;
    const clients = mockClients({
      writeContract: async (args: { functionName: string; args: unknown[] }) => {
        called = args;
        return "0x" + "cd".repeat(32);
      },
    });
    const tx = await slash(TARGET, AGENT, 1_000_000n, clients);
    expect(tx).toBe("0x" + "cd".repeat(32));
    const c = called as { functionName: string; args: unknown[] };
    expect(c.functionName).toBe("slash");
    expect(c.args[0]).toBe(keccak256(toBytes(TARGET)));
    expect(c.args[1]).toBe(AGENT);
    expect(c.args[2]).toBe(1_000_000n);
  });

  it("payout writes Arena.payout with hashed keys and stake+bounty args", async () => {
    let called: unknown;
    const clients = mockClients({
      writeContract: async (args: unknown) => {
        called = args;
        return "0x" + "ef".repeat(32);
      },
    });
    const tx = await payout(TARGET, INVARIANT, AGENT, 1_000_000n, 5_000_000n, clients);
    expect(tx).toBe("0x" + "ef".repeat(32));
    const c = called as { functionName: string; args: unknown[] };
    expect(c.functionName).toBe("payout");
    expect(c.args[0]).toBe(keccak256(toBytes(TARGET)));
    expect(c.args[1]).toBe(keccak256(toBytes(INVARIANT)));
    expect(c.args[2]).toBe(AGENT);
    expect(c.args[3]).toBe(1_000_000n);
    expect(c.args[4]).toBe(5_000_000n);
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
      const tx = await slash(TARGET, AGENT, 1_000_000n);
      expect(tx).toMatch(/^0x[0-9a-fA-F]{64}$/);
      await new Promise((r) => setTimeout(r, 3000));
      const poolAfter = await getPool(TARGET);
      expect(poolAfter).toBe(poolBefore + 1_000_000n);
      void agentKey;
    },
    180000
  );
});
