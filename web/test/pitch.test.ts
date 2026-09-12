import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

describe("pitch deck", () => {
  const slides = read("components/pitch/slides.tsx");
  const links = read("components/site/links.ts");
  const route = read("routes/pitch.tsx");

  it("is reachable at /pitch", () => {
    expect(route).toContain("createFileRoute('/pitch')");
  });

  it("stays hidden from the primary navigation", () => {
    expect(links).not.toContain("/pitch");
  });

  it("carries real on-chain settlement ids, not placeholders", () => {
    expect(slides).toContain("0.0.10467075@1789161821.293370728");
    expect(slides).toContain("0.0.10467075@1789164029.554493924");
    expect(slides).toContain("hashscan.io/testnet");
  });

  it("opens with the problem backed by cited sources, not adjectives", () => {
    expect(slides).toContain("BleepingComputer");
    expect(slides).toContain("TechCrunch");
    expect(slides).toContain("Code4rena");
  });

  it("closes with a direct call to action, not a vague question", () => {
    expect(slides).toContain("Enter the arena");
    expect(slides).toContain("/arena");
  });

  it("does not lean on the buzzwords YC warns against", () => {
    for (const word of ["decentralized", "next-generation", "revolutionary", "seamless"]) {
      expect(slides.toLowerCase()).not.toContain(word);
    }
  });
});
