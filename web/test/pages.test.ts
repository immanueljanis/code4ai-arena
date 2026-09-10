import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

function read(p: string): string {
  return readFileSync(path.join(ROOT, "src", p), "utf8");
}

describe("bounties (server-driven)", () => {
  const board = read("components/pages/Bounties.tsx");
  const detail = read("components/pages/BountyDetail.tsx");

  it("fetches from the arena client, not static catalog", () => {
    expect(board).toContain("createArenaClient");
    expect(board).toContain("listContests");
    expect(board).not.toContain("BOUNTIES");
  });

  it("uses USDC amounts and Hedera x402 copy", () => {
    expect(board).toContain("formatUsdc");
    expect(board).toContain("USDC pool");
    expect(detail).toContain("1 USDC");
    expect(detail).toContain("x402");
  });

  it("detail shows source + how-it-pays", () => {
    expect(detail).toContain("invariant to break");
    expect(detail).toContain("how it pays");
    expect(detail).toContain("source");
    expect(detail).toContain("Break it in the arena");
  });
});

describe("catalog (challenges + partners rebrand)", () => {
  const catalog = read("lib/site/catalog.ts");

  it("is Hedera ecosystem", () => {
    expect(catalog).toContain("Hedera");
    expect(catalog).toContain("x402");
    expect(catalog).toContain("ERC-8004");
  });
});

describe("challenges + partners pages", () => {
  const challenges = read("components/pages/Challenges.tsx");
  const partners = read("components/pages/Partners.tsx");

  it("reference CODE4AI + Hedera", () => {
    expect(challenges).toMatch(/CODE4AI|code4ai/i);
    expect(partners).toMatch(/CODE4AI|code4ai/i);
    expect(partners).toContain("Hedera");
  });

  it("challenges link to real targets via /arena?target=...", () => {
    expect(challenges).toContain("search={{ target: challenge.targetKey }}");
    expect(read("lib/site/catalog.ts")).toContain("targetKey: 'access-control-vault'");
    expect(read("lib/site/catalog.ts")).toContain("targetKey: 'rounding-vault'");
    expect(read("lib/site/catalog.ts")).toContain("targetKey: 'time-window-vault'");
  });

  it("challenge prizes are small (5/15/10 USDC — cheap demo)", () => {
    const catalog = read("lib/site/catalog.ts");
    expect(catalog).toMatch(/prizePool: 5,/);
    expect(catalog).toMatch(/prizePool: 15,/);
    expect(catalog).toMatch(/prizePool: 10,/);
  });
});

describe("replay gallery", () => {
  const replays = read("components/pages/Replays.tsx");

  it("covers all three target patterns and keeps a local fallback", () => {
    expect(replays).toContain("access-control-vault");
    expect(replays).toContain("rounding-vault");
    expect(replays).toContain("reentrancy-vault");
    expect(replays).toContain("VITE_SUBGRAPH_URL");
    expect(replays).toContain("Play in Playground");
  });
});
