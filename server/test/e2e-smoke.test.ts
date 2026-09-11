import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

/**
 * E2E smoke: server + Postgres + anvil playground together.
 * Prereqs: `docker compose up -d db` (port 5440), anvil on PATH, and
 * contracts/out artifacts built (`forge build` in ../contracts).
 * Run: VERIFIER_KEY=... bun test test/e2e-smoke.test.ts
 */
const BASE = process.env.E2E_API_URL ?? "http://localhost:8787";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai_test";

let serverProc: ChildProcess | null = null;

beforeAll(async () => {
  const verifierKey = process.env.VERIFIER_KEY ?? process.env.TESTNET_VERIFIER_KEY;
  if (!verifierKey) throw new Error("VERIFIER_KEY env required for smoke test");

  serverProc = spawn("bun", ["run", "src/index.ts"], {
    cwd: path.resolve(import.meta.dir, ".."),
    env: {
      ...process.env,
      DATABASE_URL,
      HEDERA_TESTNET_RPC_URL: process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api",
      HEDERA_USDC_TESTNET_ADDRESS: "0x0000000000000000000000000000000000068cda",
      ARENA_ADDRESS: process.env.REHEARSAL_ARENA_ADDRESS ?? "0x5928df319b3D062203D6aF33A6797df4a96b18a4",
      HEDERA_ARENA_ACCOUNT_ID: "0.0.1234",
      ACCESS_CONTROL_VAULT_ADDRESS: "0x73524775e7c01E862F8d0E381D1154d7939cC160",
      ROUNDING_VAULT_ADDRESS: "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A",
      TIME_WINDOW_VAULT_ADDRESS: "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd",
      VERIFIER_KEY: verifierKey,
      SERVER_WALLET_SECRET: "smoke-secret",
      PORT: "8787",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  serverProc.stderr?.on("data", (d: Buffer) => {
    process.stdout.write(`[server] ${d.toString()}`);
  });

  // wait for /api/health
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become healthy in time");
});

afterAll(() => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGKILL"); // SIGTERM leaves the child alive on Windows
  }
});

describe("E2E smoke — server + anvil playground", () => {
  it("health is ok", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("lists every seeded target with a live pool", async () => {
    const res = await fetch(`${BASE}/api/contests`);
    expect(res.status).toBe(200);
    const targets = (await res.json()) as { key: string; poolRemaining: string }[];
    expect(targets.map((t) => t.key).sort()).toEqual([
      "access-control-vault",
      "reentrancy-vault",
      "rounding-vault",
      "time-window-vault",
    ]);
    for (const t of targets) expect(BigInt(t.poolRemaining) >= 0n).toBe(true);
  }, 30000);

  it("playground: access-control exploit → VALID (real anvil replay)", async () => {
    const res = await fetch(`${BASE}/api/contests/access-control-vault/playground`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        exploitCalls: [
          { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "setOwner", args: { newOwner: "0xa11ce00000000000000000000000000000000000" } },
          { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "withdrawAll", args: {} },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict: string };
    expect(body.verdict).toBe("VALID");
  }, 90000);

  it("playground: empty calls → INVALID", async () => {
    const res = await fetch(`${BASE}/api/contests/access-control-vault/playground`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exploitCalls: [] }),
    });
    const body = (await res.json()) as { verdict: string };
    expect(body.verdict).toBe("INVALID");
  }, 90000);

  it("state returns submissions + targets", async () => {
    const res = await fetch(`${BASE}/api/state`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { submissions: unknown[]; targets: unknown[] };
    expect(Array.isArray(body.submissions)).toBe(true);
    expect(body.targets.length).toBe(4);
  }, 30000);
});
