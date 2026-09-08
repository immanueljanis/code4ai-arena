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
    expect(client).toContain("VITE_API_URL");
    expect(client).toContain("new MockArenaClient");
  });

  it("has dev/test scripts", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.dev).toBe("vite dev");
    expect(pkg.scripts.build).toBe("vite build");
  });
});
