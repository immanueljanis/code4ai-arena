import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("design system (styles.css)", () => {
  const css = readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");

  it("defines the dark tokens (purple accent)", () => {
    expect(css).toContain("--color-bg");
    expect(css).toContain("#0a0a0a");
    expect(css).toContain("#101110");
    expect(css).toContain("#a392fa"); // purple accent (rebranded from lime)
    expect(css).toContain("#e5484d"); // slash red
    expect(css).toContain("--color-ink");
    expect(css).toContain("--color-muted");
    expect(css).toContain("--color-faint");
  });

  it("uses JetBrains Mono + Geist fonts", () => {
    expect(css).toContain("JetBrains Mono");
    expect(css).toContain("Geist");
  });
});

describe("SEO head (__root.tsx)", () => {
  const root = readFileSync(path.join(ROOT, "src", "routes", "__root.tsx"), "utf8");

  it("is rebranded to CODE4AI + Hedera", () => {
    expect(root).toContain("CODE4AI");
    expect(root).toContain("Hedera");
  });
});
