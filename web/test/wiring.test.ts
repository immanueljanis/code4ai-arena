import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("wiring", () => {
  it(".env.example exists with VITE_API_URL", () => {
    const env = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(env).toContain("VITE_API_URL=http://localhost:8787");
    expect(env).toContain("VITE_EXPLORER_TX_BASE");
    expect(env).toContain("VITE_ARENA_ADDRESS");
    expect(env).toContain("VITE_USDC_ADDRESS");
  });

  it("client defaults to the mock when VITE_API_URL is unset", () => {
    const client = readFileSync(path.join(ROOT, "src/lib/arena/client.ts"), "utf8");
    expect(client).toContain("createArenaClient");
    expect(client).toContain("API_BASE_CONFIGURED");
    expect(client).toContain("MockArenaClient()");
    expect(client).toContain("new MockArenaClient");
  });

  it("has dev/test scripts", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.dev).toBe("vite dev");
    expect(pkg.scripts.build).toBe("vite build");
  });
});

describe("api base", () => {
  const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

  it("never interpolates an unset env var into a link", () => {
    for (const file of [
      "components/landing/content.ts",
      "components/landing/ForAgents.tsx",
      "components/site/links.ts",
      "lib/arena/client.ts",
    ]) {
      expect(read(file)).not.toContain("import.meta.env.VITE_API_URL");
    }
  });

  it("falls back to the dev server so hrefs stay valid without a .env", () => {
    const base = read("lib/site/apiBase.ts");
    expect(base).toContain("http://localhost:8787");
    expect(base).toContain("API_BASE_CONFIGURED");
  });
});
