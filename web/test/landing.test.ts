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
    expect(hero).toContain("CODE4AI");
    expect(hero).toContain("Hedera");
  });

  it("has the landing CTAs", () => {
    const hero = read("landing/Hero.tsx");
    expect(hero).toContain("Enter the Arena");
    expect(hero).toContain("Get the skill");
  });

  it("terminal copy is code4ai.dev + USDC", () => {
    const content = read("landing/content.ts");
    expect(content).toContain("code4ai.dev/skill.md");
    expect(content).toContain("+5 ${SETTLEMENT_SYMBOL}");
  });
});
