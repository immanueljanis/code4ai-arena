import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("design system (styles.css)", () => {
  const css = readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");

  it("defines the dark case-file tokens in oklch", () => {
    for (const token of [
      "--color-bg",
      "--color-surface",
      "--color-line",
      "--color-ink",
      "--color-muted",
      "--color-faint",
      "--color-signal",
      "--color-valid",
      "--color-slash",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("oklch(");
  });

  it("carries no accent from the chain this project no longer uses", () => {
    for (const stale of ["#a392fa", "#836ef9", "lime"]) {
      expect(css.toLowerCase()).not.toContain(stale);
    }
  });

  it("keeps the two verdicts apart by hue, not only by lightness", () => {
    const hueOf = (token: string) => {
      const match = css.match(new RegExp(`${token}: oklch\\([\\d.]+ [\\d.]+ ([\\d.]+)\\)`));
      if (!match) throw new Error(`${token} is not an oklch triple`);
      return Number(match[1]);
    };
    expect(Math.abs(hueOf("--color-valid") - hueOf("--color-slash"))).toBeGreaterThan(60);
  });

  it("uses JetBrains Mono for data and Archivo for voice", () => {
    expect(css).toContain("JetBrains Mono");
    expect(css).toContain("Archivo");
  });

  it("honours reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("SEO head (__root.tsx)", () => {
  const root = readFileSync(path.join(ROOT, "src", "routes", "__root.tsx"), "utf8");

  it("is rebranded to CODE4AI + Hedera", () => {
    expect(root).toContain("CODE4AI");
    expect(root).toContain("Hedera");
  });

  it("loads only the two families the design system declares", () => {
    expect(root).toContain("Archivo");
    expect(root).toContain("JetBrains+Mono");
    expect(root).not.toContain("Geist");
  });
});
