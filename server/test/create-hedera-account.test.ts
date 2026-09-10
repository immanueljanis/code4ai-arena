import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { ensureAccount, type AccountLedger } from "../scripts/create-hedera-account.ts";

async function storePath(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "code4ai-accounts-")), "accounts.json");
}

function ledger(): AccountLedger & { created: string[] } {
  const created: string[] = [];
  return {
    created,
    async createAccount(publicKey) {
      created.push(publicKey);
      return `0.0.${5000 + created.length}`;
    },
    async hbarBalance() {
      return "5 ℏ";
    },
  };
}

describe("hedera account provisioning", () => {
  it("creates one account and records its identity", async () => {
    const file = await storePath();
    const chain = ledger();
    const { account, created } = await ensureAccount("facilitator", 2, chain, file);

    expect(created).toBe(true);
    expect(chain.created).toHaveLength(1);
    expect(account.accountId).toBe("0.0.5001");
    expect(account.evmAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(account.privateKey).toBeTruthy();
    expect(account.publicKey).not.toBe(account.privateKey);
  });

  it("never creates a second account for the same label", async () => {
    const file = await storePath();
    const chain = ledger();
    const first = await ensureAccount("facilitator", 2, chain, file);
    const second = await ensureAccount("facilitator", 2, chain, file);

    expect(second.created).toBe(false);
    expect(second.account).toEqual(first.account);
    expect(chain.created).toHaveLength(1);
  });

  it("keeps distinct labels in one store", async () => {
    const file = await storePath();
    const chain = ledger();
    const a = await ensureAccount("facilitator", 2, chain, file);
    const b = await ensureAccount("treasury", 0, chain, file);

    expect(a.account.accountId).not.toBe(b.account.accountId);
    const store = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    expect(Object.keys(store).sort()).toEqual(["facilitator", "treasury"]);
  });

  it.skipIf(process.platform === "win32")(
    "writes the key store with owner-only permissions",
    async () => {
      const file = await storePath();
      await ensureAccount("facilitator", 1, ledger(), file);
      expect((await stat(file)).mode & 0o077).toBe(0);
    }
  );

  it("refuses to continue against a corrupt store rather than recreating accounts", async () => {
    const file = await storePath();
    await writeFile(file, "{not json");
    const chain = ledger();
    let error: Error | undefined;
    try {
      await ensureAccount("facilitator", 1, chain, file);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toContain("not valid JSON");
    expect(chain.created).toHaveLength(0);
  });
});
