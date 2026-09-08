import { SQL } from "bun";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required — link a Postgres service in Railway");
}
const DB_URL: string = databaseUrl;

export const sql = new SQL(DB_URL);

function dbHost(): string {
  try {
    const u = new URL(DB_URL);
    return `${u.hostname}:${u.port || 5432}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

export const DB_RETRY_ATTEMPTS = 15;
export const DB_RETRY_DELAY_MS = 4000;

/** Retry a startup DB step with backoff; crash loudly only after attempts run out. */
export async function withStartupRetry<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= DB_RETRY_ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.error(
        `[db] ${label} attempt ${i}/${DB_RETRY_ATTEMPTS} failed: ${(e as Error).message}`
      );
      await Bun.sleep(DB_RETRY_DELAY_MS);
    }
  }
  console.error(`[db] giving up on ${label} after ${DB_RETRY_ATTEMPTS} attempts (host: ${dbHost()})`);
  throw lastErr;
}

console.log(`[db] connecting to ${dbHost()}`);

export interface NewAgent {
  label: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  erc8004TokenId?: string | null;
}

export interface NewSubmission {
  agentId: string;
  targetKey: string;
  mode: "playground" | "real";
  exploitCalls: unknown;
  verdict?: "VALID" | "INVALID" | null;
  invariantId?: string | null;
  exploitTxHash?: string | null;
  settlementTxHash?: string | null;
  reputationTxHash?: string | null;
}

export interface TargetRow {
  key: string;
  contractAddress: string;
  objective: string;
  invariantCount: number;
  stakeAmount: number;
}

/** Create the 4 spec tables. Idempotent; call once at startup. */
export async function initSchema(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    erc8004_token_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS targets (
    key TEXT PRIMARY KEY,
    contract_address TEXT NOT NULL,
    objective TEXT NOT NULL,
    invariant_count INT NOT NULL,
    stake_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS invariants (
    id TEXT PRIMARY KEY,
    target_key TEXT NOT NULL REFERENCES targets(key),
    bounty_amount NUMERIC NOT NULL,
    claimed BOOLEAN NOT NULL DEFAULT false
  )`;

  await sql`CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    target_key TEXT NOT NULL REFERENCES targets(key),
    mode TEXT NOT NULL CHECK (mode IN ('playground', 'real')),
    exploit_calls JSONB NOT NULL,
    verdict TEXT CHECK (verdict IN ('VALID', 'INVALID')),
    invariant_id TEXT REFERENCES invariants(id),
    exploit_tx_hash TEXT,
    settlement_tx_hash TEXT,
    reputation_tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

export async function insertAgent(a: NewAgent): Promise<string> {
  const rows = await sql`
    INSERT INTO agents (label, wallet_address, encrypted_private_key, erc8004_token_id)
    VALUES (${a.label}, ${a.walletAddress}, ${a.encryptedPrivateKey}, ${a.erc8004TokenId ?? null})
    RETURNING id
  `;
  return rows[0].id as string;
}

export interface AgentRow {
  id: string;
  label: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  erc8004TokenId: string | null;
}

export async function getAgent(id: string): Promise<AgentRow | undefined> {
  const rows = await sql`SELECT * FROM agents WHERE id = ${id}`;
  if (rows.length === 0) return undefined;
  const r = rows[0];
  return {
    id: r.id as string,
    label: r.label as string,
    walletAddress: r.wallet_address as string,
    encryptedPrivateKey: r.encrypted_private_key as string,
    erc8004TokenId: r.erc8004_token_id as string | null,
  };
}

export interface InvariantRow {
  id: string;
  targetKey: string;
  bountyAmount: number;
  claimed: boolean;
}

export async function listInvariantsForTarget(targetKey: string): Promise<InvariantRow[]> {
  const rows = await sql`
    SELECT id, target_key, bounty_amount, claimed FROM invariants
    WHERE target_key = ${targetKey}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    targetKey: r.target_key as string,
    bountyAmount: Number(r.bounty_amount),
    claimed: r.claimed as boolean,
  }));
}

export async function insertSubmission(s: NewSubmission): Promise<string> {
  const rows = await sql`
    INSERT INTO submissions (
      agent_id, target_key, mode, exploit_calls, verdict, invariant_id,
      exploit_tx_hash, settlement_tx_hash, reputation_tx_hash
    ) VALUES (
      ${s.agentId}, ${s.targetKey}, ${s.mode}, ${JSON.stringify(s.exploitCalls)},
      ${s.verdict ?? null}, ${s.invariantId ?? null},
      ${s.exploitTxHash ?? null}, ${s.settlementTxHash ?? null}, ${s.reputationTxHash ?? null}
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function listTargets(): Promise<TargetRow[]> {
  const rows = await sql`SELECT
    key, contract_address, objective, invariant_count, stake_amount
    FROM targets`;
  return rows.map((r) => ({
    key: r.key as string,
    contractAddress: r.contract_address as string,
    objective: r.objective as string,
    invariantCount: Number(r.invariant_count),
    stakeAmount: Number(r.stake_amount),
  }));
}

export async function listSubmissions(limit = 50) {
  const rows = await sql`
    SELECT id, agent_id, target_key, mode, verdict, invariant_id,
           exploit_tx_hash, settlement_tx_hash, reputation_tx_hash, created_at
    FROM submissions
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    agentId: r.agent_id as string,
    targetKey: r.target_key as string,
    mode: r.mode as string,
    verdict: r.verdict as string | null,
    invariantId: r.invariant_id as string | null,
    exploitTxHash: r.exploit_tx_hash as string | null,
    settlementTxHash: r.settlement_tx_hash as string | null,
    reputationTxHash: r.reputation_tx_hash as string | null,
    createdAt: r.created_at as Date,
  }));
}
