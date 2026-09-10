import { createHash } from "node:crypto";
import { proto } from "@hiero-ledger/proto";
import type { ArenaTransferPolicy, ExactAuthorization, ExactRequirements } from "./types.ts";

export class PaymentValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface ValidatedPayment {
  transaction: string;
  paymentDigest: string;
  transactionId: string;
  payer: string;
}

type ProtoValue = Record<string, unknown>;

const MAX_SIGNATURE_PAIRS = 4;
const MAX_SIGNED_TRANSACTION_BYTES = 4096;

function fail(code: string): never {
  throw new PaymentValidationError(code);
}

function bigint(value: unknown, code: string): bigint {
  try {
    if (value === undefined || value === null) fail(code);
    return BigInt(String(value));
  } catch {
    return fail(code);
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === false || value === "" || (Array.isArray(value) && value.length === 0);
}

function rejectUnexpected(value: ProtoValue, allowed: readonly string[], code: string): void {
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.includes(key) && !isEmpty(item)) fail(code);
  }
}

function nativeId(value: unknown, code: string): string {
  if (!value || typeof value !== "object") fail(code);
  const entity = value as ProtoValue;
  if (!isEmpty(entity.alias)) fail(code);
  const shard = bigint(entity.shardNum ?? 0, code);
  const realm = bigint(entity.realmNum ?? 0, code);
  const number = bigint(entity.accountNum ?? entity.tokenNum, code);
  if (shard < 0n || realm < 0n || number < 0n) fail(code);
  return `${shard}.${realm}.${number}`;
}

function timestampMilliseconds(value: unknown, code: string): number {
  if (!value || typeof value !== "object") fail(code);
  const timestamp = value as ProtoValue;
  const seconds = bigint(timestamp.seconds, code);
  const nanos = bigint(timestamp.nanos ?? 0, code);
  if (seconds < 0n || nanos < 0n || nanos >= 1_000_000_000n) fail(code);
  const milliseconds = seconds * 1_000n + nanos / 1_000_000n;
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) fail(code);
  return Number(milliseconds);
}

function canonicalBase64(value: unknown): { encoded: string; bytes: Uint8Array } {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    fail("invalid_transaction_encoding");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || Buffer.from(bytes).toString("base64") !== value) fail("invalid_transaction_encoding");
  return { encoded: value, bytes };
}

function transactionBodies(bytes: Uint8Array): ProtoValue[] {
  let list: { transactionList?: Array<{ signedTransactionBytes?: Uint8Array }> };
  try {
    list = proto.TransactionList.decode(bytes);
  } catch {
    fail("invalid_transaction_encoding");
  }
  const transactions = list.transactionList ?? [];
  if (transactions.length === 0) fail("missing_transaction");
  const canonical = proto.TransactionList.encode(list).finish();
  if (!Buffer.from(canonical).equals(Buffer.from(bytes))) fail("unsupported_transaction_encoding");
  const bodies: ProtoValue[] = [];
  for (const transaction of transactions) {
    const signed = transaction.signedTransactionBytes;
    if (!signed || signed.length === 0) fail("missing_signed_transaction");
    let decoded: { bodyBytes?: Uint8Array; sigMap?: { sigPair?: unknown[] } };
    try {
      decoded = proto.SignedTransaction.decode(signed);
    } catch {
      fail("invalid_signed_transaction");
    }
    rejectUnexpected(decoded as ProtoValue, ["bodyBytes", "sigMap"], "unsupported_signed_transaction_field");
    if (!decoded.bodyBytes || decoded.bodyBytes.length === 0) fail("missing_transaction_body");
    const sigPairs = decoded.sigMap?.sigPair ?? [];
    if (!Array.isArray(sigPairs) || sigPairs.length > MAX_SIGNATURE_PAIRS) {
      fail("signature_map_out_of_bounds");
    }
    if (signed.length > MAX_SIGNED_TRANSACTION_BYTES) fail("signed_transaction_too_large");
    let body: ProtoValue;
    try {
      body = proto.TransactionBody.decode(decoded.bodyBytes) as ProtoValue;
    } catch {
      fail("invalid_transaction_body");
    }
    bodies.push(body);
  }
  return bodies;
}

function requireRequirements(
  authorization: ExactAuthorization,
  requirements: ExactRequirements,
  policy: ArenaTransferPolicy
): void {
  if (authorization.x402Version !== 2 || authorization.accepted === undefined || authorization.payload === undefined) fail("invalid_payment_payload");
  const expected = {
    scheme: "exact",
    network: policy.network,
    amount: policy.stakeAmount,
    asset: policy.tokenId,
    payTo: policy.arenaAccountId,
    maxTimeoutSeconds: policy.maxTimeoutSeconds,
    feePayer: policy.feePayerAccountId,
  };
  for (const candidate of [authorization.accepted, requirements]) {
    if (
      candidate?.scheme !== expected.scheme ||
      candidate.network !== expected.network ||
      candidate.amount !== expected.amount ||
      candidate.asset !== expected.asset ||
      candidate.payTo !== expected.payTo ||
      candidate.maxTimeoutSeconds !== expected.maxTimeoutSeconds ||
      candidate.extra?.feePayer !== expected.feePayer
    ) fail("payment_requirements_mismatch");
  }
}

function fingerprint(body: ProtoValue): string {
  const copy = { ...body };
  delete copy.nodeAccountID;
  try {
    return Buffer.from(proto.TransactionBody.encode(copy as never).finish()).toString("hex");
  } catch {
    return fail("invalid_transaction_body");
  }
}

function validateBody(body: ProtoValue, policy: ArenaTransferPolicy, now: number): { transactionId: string; payer: string } {
  rejectUnexpected(
    body,
    ["transactionID", "nodeAccountID", "transactionFee", "transactionValidDuration", "cryptoTransfer"],
    "unsupported_transaction_field"
  );
  if (!body.cryptoTransfer || typeof body.cryptoTransfer !== "object") fail("unexpected_transaction_type");
  const transactionId = body.transactionID as ProtoValue | undefined;
  if (!transactionId) fail("missing_transaction_id");
  rejectUnexpected(transactionId, ["accountID", "transactionValidStart", "scheduled", "nonce"], "unsupported_transaction_id_field");
  if (transactionId.scheduled === true || bigint(transactionId.nonce ?? 0, "invalid_transaction_nonce") !== 0n) fail("invalid_transaction_id");
  const feePayer = nativeId(transactionId.accountID, "invalid_fee_payer");
  if (feePayer !== policy.feePayerAccountId) fail("fee_payer_mismatch");
  const start = timestampMilliseconds(transactionId.transactionValidStart, "invalid_transaction_start");
  const duration = body.transactionValidDuration as ProtoValue | undefined;
  if (!duration) fail("missing_transaction_duration");
  rejectUnexpected(duration, ["seconds"], "unsupported_duration_field");
  const durationSeconds = Number(bigint(duration.seconds, "invalid_transaction_duration"));
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < policy.minTransactionValidDurationSeconds || durationSeconds > policy.maxTransactionValidDurationSeconds) {
    fail("invalid_transaction_duration");
  }
  if (start > now + policy.maxFutureStartSeconds * 1_000 || start + durationSeconds * 1_000 < now + policy.minRemainingLifetimeSeconds * 1_000) {
    fail("invalid_transaction_lifetime");
  }
  const fee = bigint(body.transactionFee, "missing_transaction_fee");
  if (fee <= 0n || fee > bigint(policy.maxTransactionFeeTinybar, "invalid_fee_policy")) fail("transaction_fee_out_of_bounds");
  const node = nativeId(body.nodeAccountID, "invalid_node_account");
  if (!policy.allowedNodeAccountIds.includes(node)) fail("node_account_not_allowed");
  const transfer = body.cryptoTransfer as ProtoValue;
  rejectUnexpected(transfer, ["transfers", "tokenTransfers"], "unsupported_transfer_field");
  const nativeTransfers = transfer.transfers as ProtoValue | undefined;
  if (nativeTransfers && Array.isArray(nativeTransfers.accountAmounts) && nativeTransfers.accountAmounts.length > 0) fail("unexpected_hbar_transfer");
  if (nativeTransfers) rejectUnexpected(nativeTransfers, ["accountAmounts"], "unsupported_hbar_transfer_field");
  const tokenLists = transfer.tokenTransfers;
  if (!Array.isArray(tokenLists) || tokenLists.length !== 1) fail("token_transfer_list_mismatch");
  const tokenList = tokenLists[0] as ProtoValue;
  rejectUnexpected(tokenList, ["token", "transfers", "nftTransfers", "expectedDecimals"], "unsupported_token_transfer_field");
  if (nativeId(tokenList.token, "invalid_token") !== policy.tokenId) fail("token_mismatch");
  if (Array.isArray(tokenList.nftTransfers) && tokenList.nftTransfers.length > 0) fail("nft_transfer_not_allowed");
  if (tokenList.expectedDecimals !== undefined && tokenList.expectedDecimals !== null) fail("expected_decimals_not_allowed");
  const entries = tokenList.transfers;
  if (!Array.isArray(entries) || entries.length !== 2) fail("token_transfer_entry_count");
  const parsed = entries.map((entry) => {
    if (!entry || typeof entry !== "object") fail("invalid_token_transfer");
    const transferEntry = entry as ProtoValue;
    rejectUnexpected(transferEntry, ["accountID", "amount", "isApproval", "preTxAllowanceHook", "prePostTxAllowanceHook"], "unsupported_account_transfer_field");
    if (transferEntry.isApproval === true || !isEmpty(transferEntry.preTxAllowanceHook) || !isEmpty(transferEntry.prePostTxAllowanceHook)) fail("allowance_or_hook_not_allowed");
    return { accountId: nativeId(transferEntry.accountID, "invalid_transfer_account"), amount: bigint(transferEntry.amount, "invalid_transfer_amount") };
  });
  const [first, second] = parsed;
  if (first.accountId === second.accountId || first.amount === 0n || second.amount === 0n) fail("invalid_token_transfer_entries");
  const stake = bigint(policy.stakeAmount, "invalid_stake_policy");
  const payer = policy.registeredAgentAccountId
    ? parsed.find((entry) => entry.accountId === policy.registeredAgentAccountId && entry.amount === -stake)
    : parsed.find((entry) => entry.accountId !== policy.arenaAccountId && entry.amount === -stake);
  const arena = parsed.find((entry) => entry.accountId === policy.arenaAccountId && entry.amount === stake);
  if (!payer || !arena || parsed[0].amount + parsed[1].amount !== 0n) fail("stake_transfer_mismatch");
  const seconds = bigint((transactionId.transactionValidStart as ProtoValue).seconds, "invalid_transaction_start");
  const nanos = bigint((transactionId.transactionValidStart as ProtoValue).nanos ?? 0, "invalid_transaction_start");
  return { transactionId: `${feePayer}@${seconds}.${nanos}`, payer: payer.accountId };
}

export function paymentDigest(transaction: string): string {
  const { bytes } = canonicalBase64(transaction);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function validateArenaPayment(
  authorization: ExactAuthorization,
  requirements: ExactRequirements,
  policy: ArenaTransferPolicy,
  now: number = Date.now()
): ValidatedPayment {
  requireRequirements(authorization, requirements, policy);
  const { encoded, bytes } = canonicalBase64(authorization.payload.transaction);
  const bodies = transactionBodies(bytes);
  if (bodies.length > policy.allowedNodeAccountIds.length) fail("too_many_node_transactions");
  const first = validateBody(bodies[0], policy, now);
  const seenNodes = new Set<string>();
  const expectedFingerprint = fingerprint(bodies[0]);
  for (const body of bodies) {
    const result = validateBody(body, policy, now);
    const node = nativeId(body.nodeAccountID, "invalid_node_account");
    if (seenNodes.has(node) || fingerprint(body) !== expectedFingerprint || result.transactionId !== first.transactionId || result.payer !== first.payer) {
      fail("inconsistent_node_transactions");
    }
    seenNodes.add(node);
  }
  return { transaction: encoded, paymentDigest: paymentDigest(encoded), transactionId: first.transactionId, payer: first.payer };
}
