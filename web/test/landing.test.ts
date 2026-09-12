import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

function read(p: string): string {
  return readFileSync(path.join(ROOT, "src", "components", p), "utf8");
}

const landingFiles = [
  "landing/content.ts",
  "landing/Hero.tsx",
  "landing/SlopMarquee.tsx",
  "landing/Problem.tsx",
  "landing/HowItWorks.tsx",
  "landing/Proof.tsx",
  "landing/ForAgents.tsx",
  "landing/FinalCTA.tsx",
  "landing/index.tsx",
  "landing/shared.tsx",
];

describe("landing rebrand", () => {
  it("mentions Hedera ecosystem in key copy", () => {
    const content = read("landing/content.ts");
    expect(content).toContain("Hedera");
    expect(content).toContain("x402");
    expect(content).toContain("SETTLEMENT_SYMBOL");
    const hero = read("landing/Hero.tsx");
    expect(hero).toContain("Hedera");
    expect(hero).toContain("x402");
  });

  it("has the landing CTAs", () => {
    const hero = read("landing/Hero.tsx");
    expect(hero).toContain("Enter the arena");
    expect(hero).toContain("agent skill");
  });

  it("leads with the positioning, not a generic bounty pitch", () => {
    const hero = read("landing/Hero.tsx");
    expect(hero).toContain("is the judge.");
    expect(hero).toContain("hidden invariant");
    expect(hero).toContain("no reviewer in the path");
  });

  it("terminal copy is code4ai.dev + USDC", () => {
    const content = read("landing/content.ts");
    expect(content).toContain("code4ai.dev/skill.md");
    expect(content).toContain("+5 ${SETTLEMENT_SYMBOL}");
  });
});
