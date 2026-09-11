import { describe, expect, it } from "bun:test";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS =
  process.env.REHEARSAL_ARENA_ADDRESS ?? "0x5928df319b3D062203D6aF33A6797df4a96b18a4";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.SERVER_WALLET_SECRET = "test-secret";
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const {
  MAX_ATTEMPTS_PER_AGENT_PER_HOUR,
  MAX_EXPLOIT_CALLS,
  MAX_TOTAL_WAIT_BLOCKS,
  MIN_OPERATOR_HBAR,
  assertCallBudget,
  assertCanSpend,
  operatorGasFloorWei,
} = await import("../src/limits.ts");

const WEI_PER_HBAR = 10n ** 18n;

function caught(run: () => void): (Error & { status?: number }) | undefined {
  try {
    run();
    return undefined;
  } catch (e) {
    return e as Error & { status?: number };
  }
}

async function caughtAsync(
  run: () => Promise<unknown>
): Promise<(Error & { status?: number }) | undefined> {
  try {
    await run();
    return undefined;
  } catch (e) {
    return e as Error & { status?: number };
  }
}

const healthy = {
  gasBalance: async () => 10n * WEI_PER_HBAR,
  attemptCount: async () => 0,
};

describe("request shape budget", () => {
  it("accepts a submission at the limits", () => {
    expect(
      caught(() =>
        assertCallBudget({ calls: MAX_EXPLOIT_CALLS, totalWaitBlocks: MAX_TOTAL_WAIT_BLOCKS })
      )
    ).toBeUndefined();
  });

  it("rejects more calls than one submission may deploy for", () => {
    const error = caught(() => assertCallBudget({ calls: MAX_EXPLOIT_CALLS + 1, totalWaitBlocks: 0 }));
    expect(error?.status).toBe(400);
    expect(error?.message).toContain(String(MAX_EXPLOIT_CALLS));
  });

  it("rejects a submission that would hold the runner waiting for blocks", () => {
    const error = caught(() =>
      assertCallBudget({ calls: 1, totalWaitBlocks: MAX_TOTAL_WAIT_BLOCKS + 1 })
    );
    expect(error?.status).toBe(400);
  });
});

describe("spend guards", () => {
  it("allows a run when the arena is funded and the agent is within quota", async () => {
    expect(await caughtAsync(() => assertCanSpend("agent-1", healthy))).toBeUndefined();
  });

  it("pauses submissions when the gas budget is below the floor", async () => {
    const error = await caughtAsync(() =>
      assertCanSpend("agent-1", { ...healthy, gasBalance: async () => operatorGasFloorWei() - 1n })
    );
    expect(error?.status).toBe(503);
    expect(error?.message).toContain(String(MIN_OPERATOR_HBAR));
  });

  it("allows a run at exactly the gas floor", async () => {
    expect(
      await caughtAsync(() =>
        assertCanSpend("agent-1", { ...healthy, gasBalance: async () => operatorGasFloorWei() })
      )
    ).toBeUndefined();
  });

  it("stops one agent consuming the whole hourly budget", async () => {
    const error = await caughtAsync(() =>
      assertCanSpend("greedy", {
        ...healthy,
        attemptCount: async () => MAX_ATTEMPTS_PER_AGENT_PER_HOUR,
      })
    );
    expect(error?.status).toBe(429);
  });

  it("checks the agent quota before reading the chain balance", async () => {
    let balanceReads = 0;
    await caughtAsync(() =>
      assertCanSpend("greedy", {
        gasBalance: async () => {
          balanceReads += 1;
          return 10n * WEI_PER_HBAR;
        },
        attemptCount: async () => MAX_ATTEMPTS_PER_AGENT_PER_HOUR,
      })
    );
    expect(balanceReads).toBe(0);
  });
});

const { app } = await import("../src/index.ts");

const call = (waitBlocks?: number) => ({
  caller: "0xa11ce00000000000000000000000000000000000",
  entryPoint: "setOwner",
  args: {},
  ...(waitBlocks === undefined ? {} : { waitBlocks }),
});

function post(exploitCalls: unknown, extra: Record<string, unknown> = {}) {
  return app.request("/api/contests/access-control-vault/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "00000000-0000-0000-0000-000000000000", exploitCalls, ...extra }),
  });
}

describe("submit endpoint refuses expensive requests before spending", () => {
  it("rejects more exploit calls than the budget allows", async () => {
    const res = await post(Array.from({ length: MAX_EXPLOIT_CALLS + 1 }, () => call()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(String(MAX_EXPLOIT_CALLS));
  });

  it("rejects a wait longer than one call may request", async () => {
    const res = await post([call(1000)]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("waitBlocks");
  });

  it("rejects a negative or fractional wait", async () => {
    for (const waitBlocks of [-1, 1.5]) {
      const res = await post([call(waitBlocks)]);
      expect(res.status).toBe(400);
    }
  });

  it("rejects a total wait spread across several calls", async () => {
    const res = await post(Array.from({ length: 5 }, () => call(9)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("in total");
  });

  it("rejects a body larger than the submit limit", async () => {
    const res = await app.request("/api/contests/access-control-vault/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "00000000-0000-0000-0000-000000000000",
        exploitCalls: [call()],
        padding: "x".repeat(70_000),
      }),
    });
    expect(res.status).toBe(413);
  });
});
