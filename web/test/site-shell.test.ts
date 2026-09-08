import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

function read(p: string): string {
  return readFileSync(path.join(ROOT, "src", p), "utf8");
}

describe("SiteNav", () => {
  const src = read("components/site/SiteNav.tsx");

  it("shows the CODE4AI wordmark", () => {
    expect(src).toContain("CODE4AI");
  });

  it("has nav labels and Enter Arena CTA", () => {
    expect(src).toContain("NAV_LINKS");
    expect(src).toContain("Enter Arena");
  });
});

describe("SiteFooter", () => {
  const src = read("components/site/SiteFooter.tsx");

  it("is rebranded with Hedera + CODE4AI", () => {
    expect(src).toContain("CODE4AI");
    expect(src).toContain("Powered by Hedera x402");
    expect(src).toContain("break things. get paid.");
  });
});

describe("site links", () => {
  const src = read("components/site/links.ts");

  it("has the 4 nav labels", () => {
    expect(src).toContain("Bounties");
    expect(src).toContain("Challenges");
    expect(src).toContain("Partners");
    expect(src).toContain("Arena");
  });

  it("references Hedera resources", () => {
    expect(src).toContain("docs.hedera.com");
  });
});
