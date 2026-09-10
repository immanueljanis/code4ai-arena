import { Hono } from "hono";
import { isAddress } from "viem";
import { runSubmit } from "../agentRunner.ts";
import { getTargetMeta } from "../contests.ts";
import type { ExploitCall } from "../verifier-local.ts";
import type { X402Authorization } from "../x402.ts";

export const submit = new Hono();

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

/** Agent-native real submission: stake once, prove on-chain, settle once. */
submit.post("/:key/submit", async (c) => {
  const key = c.req.param("key");
  if (!getTargetMeta(key)) return c.json({ error: "contest not found" }, 404);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: "malformed JSON body" }, 400);

  if (typeof body.agentId !== "string" || !body.agentId) {
    return c.json({ error: "agentId is required — POST /api/agents first" }, 400);
  }
  // Optional: a client-signed x402 authorization. When omitted, the server
  // signs the stake authorization on the agent's behalf (custody mode).
  const x402Authorization = body.x402Authorization as X402Authorization | undefined;
  if (x402Authorization !== undefined && typeof x402Authorization !== "object") {
    return c.json({ error: "x402Authorization must be an object" }, 400);
  }

  let calls: ExploitCall[];
  try {
    calls = parseCalls(body.exploitCalls);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  // Optional: a client-chosen retry identity. Without it every request is a new
  // attempt — a bare resend is never silently treated as a retry.
  const requestKey = c.req.header("idempotency-key")?.trim() || undefined;
  if (requestKey !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(requestKey)) {
    return c.json({ error: "Idempotency-Key must be 1-64 characters of A-Z a-z 0-9 _ -" }, 400);
  }

  try {
    const result = await runSubmit(body.agentId, key, calls, x402Authorization, undefined, requestKey);
    return c.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status) return c.json({ error: err.message }, err.status);
    return c.json({ error: err.message }, 500);
  }
});
