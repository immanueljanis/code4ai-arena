import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

function read(p: string): string {
  return readFileSync(path.join(ROOT, "src", p), "utf8");
}

describe("arena cockpit — rebrand + no old API", () => {
  const files = [
    "components/arena/index.tsx",
    "components/arena/ArenaTopBar.tsx",
    "components/arena/ContestBoard.tsx",
    "components/arena/ContestPanel.tsx",
    "components/arena/ExploitPanel.tsx",
    "components/arena/Leaderboard.tsx",
    "components/arena/ActivityFeed.tsx",
    "components/arena/atoms.tsx",
    "routes/arena.tsx",
  ];

  it("shows CODE4AI branding in the top bar", () => {
    expect(read("components/arena/ArenaTopBar.tsx")).toContain("CODE4AI");
  });

  it("uses USDC amounts", () => {
    const board = read("components/arena/ContestBoard.tsx");
    expect(board).toContain("formatUsdc");
    expect(board).toContain("pool");
    const panel = read("components/arena/ExploitPanel.tsx");
    expect(panel).toContain("stake 1 USDC");
    expect(panel).toContain("playground");
  });

  it("wires to the new client API (register/playground/submit/state)", () => {
    const hook = read("lib/arena/useArena.ts");
    expect(hook).toContain("registerAgent");
    expect(hook).toContain("runPlayground");
    expect(hook).toContain("runSubmit");
    expect(hook).toContain("client.state");
    expect(hook).not.toMatch(/subscribe|EventSource/i);
  });
});

describe("exploit panel UX", () => {
  const src = read("components/arena/ExploitPanel.tsx");

  it("has playground + submit tabs and JSON editor", () => {
    expect(src).toContain("playground");
    expect(src).toContain("submit");
    expect(src).toContain("Run playground");
    expect(src).toContain("Submit · stake 1 USDC");
    expect(src).toContain("exploitCalls");
  });

  it("shows verdicts and tx hashes", () => {
    expect(src).toContain("exploitTxHash");
    expect(src).toContain("settlementTxHash");
    expect(src).toContain("reputationTxHash");
    expect(src).toContain("VALID");
  });
});
