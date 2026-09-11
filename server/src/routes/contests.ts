import { Hono } from "hono";
import { getPool, getPoolOrNull } from "../arena.ts";
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
      poolRemaining: (await getPoolOrNull(row.key))?.toString() ?? null,
    }))
  );
  return c.json(out);
});

/** Full detail: the Solidity source + hidden-invariant-count metadata. */
contests.get("/:key", async (c) => {
  const key = c.req.param("key");
  const meta = getTargetMeta(key);
  if (!meta) return c.json({ error: "contest not found" }, 404);

  // null, never "0": an unreadable pool must not render as a solved bounty.
  const poolRemaining = (await getPoolOrNull(key))?.toString() ?? null;

  return c.json({
    key,
    objective: meta.objective,
    invariantCount: meta.invariantCount,
    stakeAmount: Number(meta.stakeAmount),
    poolRemaining,
    source: targetSource(key),
  });
});
