import { describe, expect, it } from "bun:test";
import { HttpArenaClient } from "../src/lib/arena/client.ts";
import { formatUsdc, signed, timeAgo } from "../src/lib/arena/format.ts";

const BASE = "http://server.test";

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<unknown>) {
  // @ts-expect-error fetch swap
  globalThis.fetch = async (url: string, init?: RequestInit) =>
    new Response(JSON.stringify(await handler(url, init)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

describe("HttpArenaClient", () => {
  it("listContests hits GET /api/contests and parses targets", async () => {
    let hit = "";
    mockFetch(async (url) => {
      hit = url;
      return [
        {
          key: "access-control-vault",
          objective: "Seize ownership",
          invariantCount: 1,
          stakeAmount: "1000000",
          poolRemaining: "20000000",
        },
      ];
    });
    const client = new HttpArenaClient(BASE);
    const contests = await client.listContests();
    expect(hit).toBe(`${BASE}/api/contests`);
    expect(contests[0].key).toBe("access-control-vault");
    expect(contests[0].poolRemaining).toBe("20000000");
  });

  it("getContest returns null on 404", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "contest not found" }), { status: 404 });
    const client = new HttpArenaClient(BASE);
    expect(await client.getContest("nope")).toBeNull();
  });

  it("registerAgent POSTs label and returns registration", async () => {
    let body = "";
    mockFetch(async (_url, init) => {
      body = String(init?.body);
      return { id: "agent_1", label: "tester", walletAddress: "0xabc", erc8004TokenId: "mock-id:1" };
    });
    const client = new HttpArenaClient(BASE);
    const reg = await client.registerAgent("tester");
    expect(JSON.parse(body)).toEqual({ label: "tester" });
    expect(reg.id).toBe("agent_1");
  });

  it("playground POSTs exploitCalls and returns verdict", async () => {
    let body = "";
    mockFetch(async (_url, init) => {
      body = String(init?.body);
      return { verdict: "VALID" };
    });
    const client = new HttpArenaClient(BASE);
    const result = await client.playground("access-control-vault", [
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "setOwner", args: {} },
    ]);
    expect(JSON.parse(body).exploitCalls.length).toBe(1);
    expect(result.verdict).toBe("VALID");
  });

  it("submit POSTs agentId + exploitCalls and returns hashes", async () => {
    let body = "";
    mockFetch(async (_url, init) => {
      body = String(init?.body);
      return {
        submissionId: "sub_1",
        verdict: "VALID",
        exploitTxHash: "0x" + "a".repeat(64),
        settlementTxHash: "0x" + "b".repeat(64),
        reputationTxHash: "0x" + "c".repeat(64),
      };
    });
    const client = new HttpArenaClient(BASE);
    const result = await client.submit("access-control-vault", "agent_1", []);
    const parsed = JSON.parse(body);
    expect(parsed.agentId).toBe("agent_1");
    expect(Array.isArray(parsed.exploitCalls)).toBe(true);
    expect(parsed.x402Authorization).toBeUndefined();
    expect(result.settlementTxHash).toMatch(/^0x/);
  });

  it("state returns submissions + targets", async () => {
    mockFetch(async () => ({
      submissions: [
        {
          id: "sub_1",
          agentId: "agent_1",
          targetKey: "access-control-vault",
          mode: "real",
          verdict: "VALID",
          exploitTxHash: "0xaa",
          settlementTxHash: "0xbb",
          reputationTxHash: "0xcc",
          createdAt: "2026-08-08T00:00:00Z",
        },
      ],
      targets: [
        {
          key: "access-control-vault",
          objective: "x",
          invariantCount: 1,
          stakeAmount: "1000000",
          poolRemaining: "20000000",
        },
      ],
    }));
    const client = new HttpArenaClient(BASE);
    const state = await client.state();
    expect(state.submissions.length).toBe(1);
    expect(state.targets.length).toBe(1);
  });
});

describe("formatUsdc", () => {
  it("formats atomic units as USDC", () => {
    expect(formatUsdc("5000000")).toBe("5 USDC");
    expect(formatUsdc("1000000")).toBe("1 USDC");
    expect(formatUsdc("1500000")).toBe("1.5 USDC");
    expect(formatUsdc("10000000")).toBe("10 USDC");
  });

  it("switches to the DemoUSD test token under the demo-hts profile", () => {
    const out = Bun.spawnSync({
      cmd: [
        "bun",
        "-e",
        "import('./src/lib/arena/format.ts').then((m) => console.log(m.SETTLEMENT_SYMBOL, m.formatUsdc('1500000')))",
      ],
      cwd: `${import.meta.dir}/..`,
      env: { ...process.env, VITE_SETTLEMENT_PROFILE: "demo-hts" },
    });
    expect(out.stdout.toString().trim()).toBe("DemoUSD 1.5 DemoUSD");
  });

  it("signed() prefixes +/−", () => {
    expect(signed("5000000")).toBe("+5 USDC");
    expect(signed("-1000000")).toBe("−1 USDC");
  });
});

describe("timeAgo", () => {
  it("handles ISO strings", () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 10_000).toISOString(), now)).toBe("10s ago");
    expect(timeAgo(new Date(now - 3_600_000).toISOString(), now)).toBe("1h ago");
  });
});
