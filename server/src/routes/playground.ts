import { Hono } from "hono";
import { isAddress } from "viem";
import { getTargetMeta } from "../contests.ts";
import { runPlaygroundVerification, type ExploitCall } from "../verifier-local.ts";

export const playground = new Hono();

function parseCalls(raw: unknown): ExploitCall[] {
  if (!Array.isArray(raw)) throw new Error("exploitCalls must be an array");
  return raw.map((c, i) => {
    const call = c as Record<string, unknown>;
    if (typeof call.caller !== "string" || !isAddress(call.caller)) {
      throw new Error(`exploitCalls[${i}].caller must be a valid address`);
    }
    if (typeof call.entryPoint !== "string" || !call.entryPoint) {
      throw new Error(`exploitCalls[${i}].entryPoint is required`);
    }
    const args = call.args && typeof call.args === "object" ? call.args : {};
    return {
      caller: call.caller,
      entryPoint: call.entryPoint,
      args: args as Record<string, unknown>,
      waitBlocks: typeof (call as Record<string, unknown>)['waitBlocks'] === 'number' ? ((call as Record<string, unknown>)['waitBlocks'] as number) : undefined,
    };
  });
}

/**
 * Free verification sandbox: spins up Anvil, deploys the target fresh,
 * replays the calls, judges invariantHolds(). No payment, no settlement.
 */
playground.post("/:key/playground", async (c) => {
  const key = c.req.param("key");
  const meta = getTargetMeta(key);
  if (!meta) return c.json({ error: "contest not found" }, 404);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: "malformed JSON body" }, 400);

  let calls: ExploitCall[];
  try {
    calls = parseCalls(body.exploitCalls);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const verdict = await runPlaygroundVerification(key, calls);
  return c.json({ verdict });
});
