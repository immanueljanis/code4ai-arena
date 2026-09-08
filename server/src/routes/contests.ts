import { Hono } from "hono";
import { getPool } from "../arena.ts";
import { listTargets } from "../db.ts";
import { getTargetMeta, listTargetRows, targetSource } from "../contests.ts";

export const contests = new Hono();

/** The bounty board: targets with invariant COUNT only (R8 — never text/ids). */
contests.get("/", async (c) => {
  const rows = await listTargetRows();
  const out = await Promise.all(
    rows.map(async (row) => ({
      key: row.key,
      objective: row.objective,
      invariantCount: row.invariantCount,
      stakeAmount: Number(row.stakeAmount),
      poolRemaining: (await getPool(row.key)).toString(),
    }))
  );
  return c.json(out);
});

/** Full detail: the Solidity source + hidden-invariant-count metadata. */
contests.get("/:key", async (c) => {
  const key = c.req.param("key");
  const meta = getTargetMeta(key);
  if (!meta) return c.json({ error: "contest not found" }, 404);

  let poolRemaining = "0";
  try {
    poolRemaining = (await getPool(key)).toString();
  } catch {
    // Pool read failure (e.g. unverified contract) — surface 0 rather than 500.
  }

  return c.json({
    key,
    objective: meta.objective,
    invariantCount: meta.invariantCount,
    stakeAmount: Number(meta.stakeAmount),
    poolRemaining,
    source: targetSource(key),
  });
});
