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

export type AttemptPhase =
  | "accepted"
  | "provisioning"
  | "proving"
  | "proved"
  | "payment_pending"
  | "payment_confirmed"
  | "accounting_pending"
  | "accounting_confirmed"
  | "completed"
  | "terminal_failed";

export interface NewSubmissionAttempt {
  deploymentId: string;
  agentId: string;
  targetKey: string;
  requestKey?: string;
  requestDigest: string;
}

export interface SubmissionAttempt {
  id: string;
  deploymentId: string;
  agentId: string;
  targetKey: string;
  requestKey: string | null;
  requestDigest: string;
  phase: AttemptPhase;
  targetAddress: string | null;
  verdict: "VALID" | "INVALID" | null;
  paymentAuthorization: string | null;
  paymentTransactionId: string | null;
  exploitReceipt: string | null;
  settlementReceipt: string | null;
  accountingReceipt: string | null;
  reputationReceipt: string | null;
  submissionId: string | null;
  result: unknown | null;
  error: string | null;
  leaseVersion: number;
}

function attemptFromRow(r: Record<string, unknown>): SubmissionAttempt {
  return {
    id: r.id as string,
    deploymentId: r.deployment_id as string,
    agentId: r.agent_id as string,
    targetKey: r.target_key as string,
    requestKey: r.request_key as string | null,
    requestDigest: r.request_digest as string,
    phase: r.phase as AttemptPhase,
    targetAddress: r.target_address as string | null,
    verdict: r.verdict as "VALID" | "INVALID" | null,
    paymentAuthorization: r.payment_authorization as string | null,
    paymentTransactionId: r.payment_transaction_id as string | null,
    exploitReceipt: r.exploit_receipt as string | null,
    settlementReceipt: r.settlement_receipt as string | null,
    accountingReceipt: r.accounting_receipt as string | null,
    reputationReceipt: r.reputation_receipt as string | null,
    submissionId: r.submission_id as string | null,
    result: typeof r.result === "string" ? JSON.parse(r.result) : (r.result ?? null),
    error: r.error as string | null,
    leaseVersion: Number(r.lease_version),
  };
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

  await sql`CREATE TABLE IF NOT EXISTS submission_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id TEXT NOT NULL,
    agent_id UUID NOT NULL REFERENCES agents(id),
    target_key TEXT NOT NULL REFERENCES targets(key),
    request_key TEXT,
    request_digest TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN (
      'accepted', 'provisioning', 'proving', 'proved', 'payment_pending',
      'payment_confirmed', 'accounting_pending', 'accounting_confirmed',
      'completed', 'terminal_failed'
    )),
    target_address TEXT,
    verdict TEXT CHECK (verdict IN ('VALID', 'INVALID')),
    payment_authorization TEXT,
    payment_transaction_id TEXT,
    exploit_receipt TEXT,
    settlement_receipt TEXT,
    accounting_receipt TEXT,
    reputation_receipt TEXT,
    submission_id UUID UNIQUE REFERENCES submissions(id),
    result JSONB,
    error TEXT,
    lease_version BIGINT NOT NULL DEFAULT 0,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS submission_attempt_request_key_unique
    ON submission_attempts (deployment_id, agent_id, request_key)
    WHERE request_key IS NOT NULL`;
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

export async function createSubmissionAttempt(input: NewSubmissionAttempt): Promise<{
  attempt: SubmissionAttempt;
  created: boolean;
}> {
  if (!input.requestKey) {
    const rows = await sql`
      INSERT INTO submission_attempts (
        deployment_id, agent_id, target_key, request_key, request_digest, phase
      ) VALUES (
        ${input.deploymentId}, ${input.agentId}, ${input.targetKey}, null,
        ${input.requestDigest}, 'accepted'
      ) RETURNING *
    `;
    return { attempt: attemptFromRow(rows[0] as Record<string, unknown>), created: true };
  }
  const inserted = await sql`
    INSERT INTO submission_attempts (
      deployment_id, agent_id, target_key, request_key, request_digest, phase
    ) VALUES (
      ${input.deploymentId}, ${input.agentId}, ${input.targetKey}, ${input.requestKey},
      ${input.requestDigest}, 'accepted'
    ) ON CONFLICT DO NOTHING RETURNING *
  `;
  if (inserted.length) {
    return { attempt: attemptFromRow(inserted[0] as Record<string, unknown>), created: true };
  }
  const rows = await sql`
    SELECT * FROM submission_attempts
    WHERE deployment_id = ${input.deploymentId} AND agent_id = ${input.agentId}
      AND request_key = ${input.requestKey}
  `;
  const attempt = attemptFromRow(rows[0] as Record<string, unknown>);
  if (attempt.requestDigest !== input.requestDigest) {
    throw Object.assign(new Error("Idempotency-Key is already used for a different request"), { status: 409 });
  }
  return { attempt, created: false };
}

export async function updateSubmissionAttempt(
  attemptId: string,
  phase: AttemptPhase,
  fields: Partial<Pick<SubmissionAttempt,
    "targetAddress" | "verdict" | "paymentAuthorization" | "paymentTransactionId" |
    "exploitReceipt" | "settlementReceipt" | "accountingReceipt" | "reputationReceipt" |
    "submissionId" | "result" | "error"
  >> = {}
): Promise<void> {
  await sql`
    UPDATE submission_attempts SET
      phase = ${phase},
      target_address = COALESCE(${fields.targetAddress ?? null}, target_address),
      verdict = COALESCE(${fields.verdict ?? null}, verdict),
      payment_authorization = COALESCE(${fields.paymentAuthorization ?? null}, payment_authorization),
      payment_transaction_id = COALESCE(${fields.paymentTransactionId ?? null}, payment_transaction_id),
      exploit_receipt = COALESCE(${fields.exploitReceipt ?? null}, exploit_receipt),
      settlement_receipt = COALESCE(${fields.settlementReceipt ?? null}, settlement_receipt),
      accounting_receipt = COALESCE(${fields.accountingReceipt ?? null}, accounting_receipt),
      reputation_receipt = COALESCE(${fields.reputationReceipt ?? null}, reputation_receipt),
      submission_id = COALESCE(${fields.submissionId ?? null}, submission_id),
      result = COALESCE(${fields.result === undefined ? null : JSON.stringify(fields.result)}::jsonb, result),
      error = COALESCE(${fields.error ?? null}, error),
      updated_at = now()
    WHERE id = ${attemptId}
  `;
}

/**
 * A VALID verdict never settles the stake, so the signed payment is dropped
 * rather than kept. This is the only revocation the arena can actually perform:
 * the bytes stay valid on Hedera until they expire, so the real guarantee is
 * that neither this server nor the facilitator will ever submit them.
 */
export async function discardPaymentAuthorization(attemptId: string): Promise<void> {
  await sql`
    UPDATE submission_attempts
    SET payment_authorization = NULL, updated_at = now()
    WHERE id = ${attemptId}
  `;
}

export async function getSubmissionAttempt(attemptId: string): Promise<SubmissionAttempt | undefined> {
  const rows = await sql`SELECT * FROM submission_attempts WHERE id = ${attemptId}`;
  return rows.length ? attemptFromRow(rows[0] as Record<string, unknown>) : undefined;
}

/**
 * Compare-and-swap the attempt phase. Returns false when another worker already
 * moved it on, which is what keeps two concurrent requests for the same
 * Idempotency-Key from provisioning, paying or settling twice.
 */
export async function claimSubmissionAttempt(
  attemptId: string,
  fromPhase: AttemptPhase,
  toPhase: AttemptPhase
): Promise<boolean> {
  const rows = await sql`
    UPDATE submission_attempts
    SET phase = ${toPhase}, lease_version = lease_version + 1, updated_at = now()
    WHERE id = ${attemptId} AND phase = ${fromPhase}
    RETURNING id
  `;
  return rows.length === 1;
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
