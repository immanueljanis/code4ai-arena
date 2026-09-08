import { Hono } from "hono";
import { getPool } from "../arena.ts";
import { listSubmissions, listTargets } from "../db.ts";

export const spectator = new Hono();

/** Spectator feed: recent submissions with verdicts + targets with live pools. */
spectator.get("/state", async (c) => {
  const [submissions, targets] = await Promise.all([listSubmissions(50), listTargets()]);

  const targetsWithPools = await Promise.all(
    targets.map(async (t) => ({
      key: t.key,
      objective: t.objective,
      invariantCount: t.invariantCount,
      stakeAmount: Number(t.stakeAmount),
      poolRemaining: (await getPool(t.key)).toString(),
    }))
  );

  return c.json({ submissions, targets: targetsWithPools });
});
