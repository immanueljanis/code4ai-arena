import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "./config.ts";
import { sql } from "./db.ts";

/**
 * A public submission spends the operator's HBAR: it deploys a fresh target,
 * tops the agent wallet up and sends every exploit call. These bounds keep one
 * request, one agent and the arena as a whole inside a budget.
 */
export const MAX_EXPLOIT_CALLS = 10;
export const MAX_WAIT_BLOCKS_PER_CALL = 10;
export const MAX_TOTAL_WAIT_BLOCKS = 20;
export const MAX_SUBMIT_BODY_BYTES = 64 * 1024;
export const MAX_ATTEMPTS_PER_AGENT_PER_HOUR = 20;

const WEI_PER_HBAR = 10n ** 18n;

/** Below this the arena stops accepting work rather than half-finishing a run. */
export const MIN_OPERATOR_HBAR = Number(process.env.MIN_OPERATOR_HBAR ?? "2");

export function operatorGasFloorWei(): bigint {
  return BigInt(Math.round(MIN_OPERATOR_HBAR * 1000)) * WEI_PER_HBAR / 1000n;
}

export async function operatorGasBalance(): Promise<bigint> {
  const client = createPublicClient({
    transport: http(serverConfig.rpcUrl, { retryCount: 3, retryDelay: 1000 }),
  });
  return client.getBalance({ address: privateKeyToAccount(serverConfig.verifierKey).address });
}

export async function recentAttemptCount(agentId: string): Promise<number> {
  const rows = await sql`
    SELECT count(*)::int AS n FROM submission_attempts
    WHERE agent_id = ${agentId} AND created_at > now() - interval '1 hour'
  `;
  return (rows[0] as { n: number }).n;
}

export interface CallBudget {
  calls: number;
  totalWaitBlocks: number;
}

/** Reject a request whose shape alone would be expensive, before anything spends. */
export function assertCallBudget(budget: CallBudget): void {
  if (budget.calls > MAX_EXPLOIT_CALLS) {
    throw Object.assign(
      new Error(`exploitCalls may contain at most ${MAX_EXPLOIT_CALLS} calls`),
      { status: 400 }
    );
  }
  if (budget.totalWaitBlocks > MAX_TOTAL_WAIT_BLOCKS) {
    throw Object.assign(
      new Error(`exploitCalls may wait at most ${MAX_TOTAL_WAIT_BLOCKS} blocks in total`),
      { status: 400 }
    );
  }
}

export interface SpendGuards {
  gasBalance: typeof operatorGasBalance;
  attemptCount: typeof recentAttemptCount;
}

export const realSpendGuards: SpendGuards = {
  gasBalance: operatorGasBalance,
  attemptCount: recentAttemptCount,
};

/**
 * Refuse to start a run the arena cannot afford to finish, and stop a single
 * agent from consuming the whole budget. Checked before funding or deploying.
 */
export async function assertCanSpend(agentId: string, guards: SpendGuards): Promise<void> {
  const attempts = await guards.attemptCount(agentId);
  if (attempts >= MAX_ATTEMPTS_PER_AGENT_PER_HOUR) {
    throw Object.assign(
      new Error(
        `agent ${agentId} reached ${MAX_ATTEMPTS_PER_AGENT_PER_HOUR} submissions in the last hour`
      ),
      { status: 429 }
    );
  }

  const balance = await guards.gasBalance();
  if (balance < operatorGasFloorWei()) {
    throw Object.assign(
      new Error(
        `arena gas budget is below ${MIN_OPERATOR_HBAR} HBAR; submissions are paused until it is topped up`
      ),
      { status: 503 }
    );
  }
}
