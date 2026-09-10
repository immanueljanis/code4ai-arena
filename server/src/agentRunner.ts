//! Real-submission orchestration — capture payment → prove → settle once.
//!
//! - VALID:   discard the x402 payment (stake never moves) + Arena.payout pays
//!            stake+bounty from the pool in one tx.
//! - INVALID: settle the captured payment into the pool via Arena.slash.
//! In both cases: write ERC-8004 feedback + persist the submission row.

import { createHash } from "node:crypto";
import { decryptPrivateKey, encryptPrivateKey } from "./wallet.ts";
import { runOnchainVerification } from "./verifier-onchain.ts";
import {
  settleStakeAuthorization,
  discardAuthorization,
  signStakeAuthorization,
  stakePaymentRequirements,
  verifyStakeAuthorization,
  type X402Authorization,
} from "./x402.ts";
import { payout, slash, invalidatePool } from "./arena.ts";
import { ensureAgentUsdc } from "./fund.ts";
import { writeReputationFeedback } from "./erc8004.ts";
import {
  claimSubmissionAttempt,
  createSubmissionAttempt,
  getAgent,
  insertSubmission,
  updateSubmissionAttempt,
  type AgentRow,
} from "./db.ts";
import { getTargetMeta } from "./contests.ts";
import { serverConfig } from "./config.ts";
import type { ExploitCall } from "./verifier-local.ts";

export interface SubmitResult {
  attemptId: string;
  submissionId: string;
  verdict: "VALID" | "INVALID";
  exploitTxHash: string;
  settlementTxHash: string;
  reputationTxHash: string;
}

/**
 * One Arena deployment's journal namespace. Switching settlement asset means
 * a new Arena, and an attempt from the old one must never resume against it.
 */
function deploymentId(): string {
  return `${serverConfig.chainId}:${serverConfig.arenaAddress.toLowerCase()}`;
}

/** Stable fingerprint of everything that makes a submission the same request. */
export function requestDigest(
  targetKey: string,
  exploitCalls: ExploitCall[],
  x402Authorization?: X402Authorization
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        targetKey,
        exploitCalls,
        authorization: x402Authorization?.payload.transaction ?? null,
      })
    )
    .digest("hex");
}

/** Injectable side-effects so the orchestration is unit-testable without mocks. */
export interface SubmitDeps {
  verify: typeof runOnchainVerification;
  signAuth: typeof signStakeAuthorization;
  settleAuth: typeof settleStakeAuthorization;
  verifyAuth: typeof verifyStakeAuthorization;
  discardAuth: typeof discardAuthorization;
  doPayout: typeof payout;
  doSlash: typeof slash;
  writeFeedback: typeof writeReputationFeedback;
  fundAgent: typeof ensureAgentUsdc;
}

const realDeps: SubmitDeps = {
  verify: runOnchainVerification,
  signAuth: signStakeAuthorization,
  settleAuth: settleStakeAuthorization,
  verifyAuth: verifyStakeAuthorization,
  discardAuth: discardAuthorization,
  doPayout: payout,
  doSlash: slash,
  writeFeedback: writeReputationFeedback,
  fundAgent: ensureAgentUsdc,
};

/** The stake amount, USDC 6 decimals (flat 1 USDC per target). */
const STAKE = 1_000_000n;

/** Validate that an x402 authorization is bound to OUR Arena + USDC + stake. */
function validateAuthorization(auth: X402Authorization): void {
  const authAccepted = auth.accepted;
  if (!authAccepted || typeof authAccepted !== "object") {
    throw Object.assign(new Error("x402Authorization.accepted is required"), { status: 400 });
  }
  const expected = stakePaymentRequirements();
  if (authAccepted.scheme !== expected.scheme || authAccepted.network !== expected.network) {
    throw Object.assign(
      new Error(`x402 payment must use Hedera exact (${expected.network})`),
      { status: 400 }
    );
  }
  const payTo = authAccepted.payTo?.toLowerCase();
  const asset = authAccepted.asset?.toLowerCase();
  if (payTo !== expected.payTo.toLowerCase()) {
    throw Object.assign(
      new Error(`x402 payTo must be the Arena account (got ${authAccepted.payTo})`),
      { status: 400 }
    );
  }
  if (asset !== expected.asset.toLowerCase()) {
    throw Object.assign(new Error(`x402 asset must be USDC (got ${authAccepted.asset})`), {
      status: 400,
    });
  }
  if (
    authAccepted.amount !== expected.amount ||
    authAccepted.maxTimeoutSeconds !== expected.maxTimeoutSeconds ||
    authAccepted.extra?.feePayer?.toLowerCase() !== expected.extra.feePayer.toLowerCase()
  ) {
    throw Object.assign(
      new Error(`x402 amount must be the 1 USDC stake (got ${authAccepted.amount})`),
      { status: 400 }
    );
  }
}

export async function runSubmit(
  agentId: string,
  targetKey: string,
  exploitCalls: ExploitCall[],
  x402Authorization?: X402Authorization,
  deps: SubmitDeps = realDeps,
  requestKey?: string
): Promise<SubmitResult> {
  const agent: AgentRow | undefined = await getAgent(agentId);
  if (!agent) throw Object.assign(new Error("agent not found"), { status: 404 });

  const meta = getTargetMeta(targetKey);
  if (!meta) throw Object.assign(new Error("contest not found"), { status: 404 });

  // The server holds the agent's encrypted wallet; decrypt it so the exploit
  // calls can be signed by the agent's own address.
  const agentKey = decryptPrivateKey(agent.encryptedPrivateKey, serverConfig.serverWalletSecret) as `0x${string}`;

  // 0. Journal the attempt before anything external happens. A repeated
  //    Idempotency-Key returns the stored result instead of paying again; a
  //    changed request under the same key is rejected as a conflict.
  const { attempt, created } = await createSubmissionAttempt({
    deploymentId: deploymentId(),
    agentId: agent.id,
    targetKey,
    requestKey,
    requestDigest: requestDigest(targetKey, exploitCalls, x402Authorization),
  });
  const attemptId = attempt.id;
  if (!created) {
    if (attempt.phase === "completed" && attempt.result) {
      return attempt.result as SubmitResult;
    }
    throw Object.assign(
      new Error(`attempt ${attemptId} is already in progress (phase ${attempt.phase})`),
      { status: 409 }
    );
  }
  if (!(await claimSubmissionAttempt(attemptId, "accepted", "provisioning"))) {
    throw Object.assign(new Error(`attempt ${attemptId} is already claimed`), { status: 409 });
  }

  // 0. A client-supplied authorization is checked before any spending, so a
  //    mismatched stake cannot make the server fund the agent.
  if (x402Authorization) validateAuthorization(x402Authorization);

  // 0b. Fund the agent's stake (USDC) from the verifier — custody mode. The
  //    verifier (deployer) holds testnet USDC and tops the agent wallet up.
  await deps.fundAgent(agent.walletAddress as `0x${string}`);

  // 0c. Stake authorization: use the client-signed one if provided, otherwise
  //     sign on the agent's behalf (custody mode).
  const auth = x402Authorization ?? (await deps.signAuth(agentKey));
  validateAuthorization(auth);

  // 0d. Read-only facilitator check of the signed bytes and payer before the
  //     proof runs, so an unpayable or unbound stake never reaches settlement.
  const { paymentDigest } = await deps.verifyAuth(auth);

  // 0e. The signed bytes are recorded before any submission so a crash resumes
  //     the same authorization instead of generating a replacement payment.
  await updateSubmissionAttempt(attemptId, "proving", {
    paymentAuthorization: encryptPrivateKey(
      JSON.stringify(auth),
      serverConfig.serverWalletSecret
    ),
    paymentTransactionId: paymentDigest ?? null,
  });

  // 1. Prove on-chain (fresh target instance).
  const { verdict, exploitTxHash } = await deps.verify(
    targetKey,
    exploitCalls,
    agentKey as `0x${string}`
  );
  await updateSubmissionAttempt(attemptId, "proved", { verdict, exploitReceipt: exploitTxHash });

  // 2. Settle exactly once (R2).
  let settlementTxHash: string;
  if (verdict === "VALID") {
    deps.discardAuth(auth); // stake never moves
    await updateSubmissionAttempt(attemptId, "accounting_pending");
    settlementTxHash = await deps.doPayout(
      targetKey,
      meta.invariantId,
      agent.walletAddress,
      STAKE,
      BigInt(meta.bountyAmount),
      attemptId
    );
  } else {
    await updateSubmissionAttempt(attemptId, "payment_pending");
    settlementTxHash = await deps.settleAuth(auth, attemptId, paymentDigest);
    await updateSubmissionAttempt(attemptId, "accounting_pending", {
      settlementReceipt: settlementTxHash,
    });
    await deps.doSlash(targetKey, agent.walletAddress, STAKE, attemptId);
  }
  await updateSubmissionAttempt(attemptId, "accounting_confirmed", {
    accountingReceipt: settlementTxHash,
  });
  invalidatePool(targetKey); // pool changed on-chain — refresh reads

  // 3. Reputation feedback (ERC-8004, mock by default).
  const reputationTxHash = await deps.writeFeedback(
    agent.erc8004TokenId ?? agent.id,
    verdict
  );

  // 4. Persist.
  const submissionId = await insertSubmission({
    agentId: agent.id,
    targetKey,
    mode: "real",
    exploitCalls,
    verdict,
    invariantId: verdict === "VALID" ? meta.invariantId : null,
    exploitTxHash,
    settlementTxHash,
    reputationTxHash,
  });

  const result: SubmitResult = {
    attemptId,
    submissionId,
    verdict,
    exploitTxHash,
    settlementTxHash,
    reputationTxHash,
  };
  await updateSubmissionAttempt(attemptId, "completed", {
    submissionId,
    reputationReceipt: reputationTxHash,
    result,
  });

  return result;
}
