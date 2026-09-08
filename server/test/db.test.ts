import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";

// db.ts reads DATABASE_URL at module load — set it BEFORE the dynamic import.
process.env.DATABASE_URL = TEST_DB_URL;

const { initSchema, insertAgent, insertSubmission, listTargets, sql } = await import(
  "../src/db.ts"
);

beforeAll(async () => {
  await initSchema();
});

afterAll(async () => {
  await sql`DROP TABLE IF EXISTS submissions, invariants, targets, agents CASCADE`;
  await sql.end();
});

describe("db schema", () => {
  it("creates the 4 spec tables with expected columns", async () => {
    const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    const names = tables.map((t) => t.tablename as string);
    expect(names).toContain("agents");
    expect(names).toContain("targets");
    expect(names).toContain("invariants");
    expect(names).toContain("submissions");

    const cols = await sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'agents' ORDER BY ordinal_position
    `;
    const colNames = cols.map((c) => c.column_name as string);
    expect(colNames).toContain("id");
    expect(colNames).toContain("label");
    expect(colNames).toContain("wallet_address");
    expect(colNames).toContain("encrypted_private_key");
    expect(colNames).toContain("erc8004_token_id");
    expect(colNames).toContain("created_at");
  });

  it("round-trips an agent row", async () => {
    const id = await insertAgent({
      label: "test-agent",
      walletAddress: "0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496",
      encryptedPrivateKey: "aGVsbG8=",
      erc8004TokenId: "tok_test",
    });

    const rows = await sql`SELECT * FROM agents WHERE id = ${id}`;
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe("test-agent");
    expect(rows[0].wallet_address).toBe("0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496");
    expect(rows[0].erc8004_token_id).toBe("tok_test");
  });

  it("round-trips a submission row with tx hashes", async () => {
    const agentId = await insertAgent({
      label: "sub-agent",
      walletAddress: "0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496",
      encryptedPrivateKey: "aGVsbG8=",
      erc8004TokenId: "tok_sub",
    });

    await sql`INSERT INTO targets (key, contract_address, objective, invariant_count, stake_amount)
      VALUES ('access-control-vault', '0x73524775e7c01E862F8d0E381D1154d7939cC160', 'seize ownership', 1, 1000000)
      ON CONFLICT (key) DO NOTHING`;

    await sql`INSERT INTO invariants (id, target_key, bounty_amount, claimed)
      VALUES ('0xabc', 'access-control-vault', 5000000, false)
      ON CONFLICT (id) DO NOTHING`;

    const subId = await insertSubmission({
      agentId,
      targetKey: "access-control-vault",
      mode: "real",
      exploitCalls: [{ caller: "0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496", entryPoint: "setOwner", args: {} }],
      verdict: "VALID",
      invariantId: "0xabc",
      exploitTxHash: "0xaaaa",
      settlementTxHash: "0xbbbb",
      reputationTxHash: "0xcccc",
    });

    const rows = await sql`SELECT * FROM submissions WHERE id = ${subId}`;
    expect(rows.length).toBe(1);
    expect(rows[0].verdict).toBe("VALID");
    expect(rows[0].exploit_tx_hash).toBe("0xaaaa");
    expect(rows[0].settlement_tx_hash).toBe("0xbbbb");
    expect(rows[0].reputation_tx_hash).toBe("0xcccc");
  });

  it("lists targets with invariant counts", async () => {
    const targets = await listTargets();
    expect(targets.length).toBeGreaterThan(0);
    const acv = targets.find((t) => t.key === "access-control-vault");
    expect(acv).toBeDefined();
    expect(acv!.invariantCount).toBeGreaterThan(0);
  });
});
