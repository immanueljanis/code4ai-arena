import { proto } from "@hiero-ledger/proto";
import type { ArenaTransferPolicy, ExactAuthorization, ExactRequirements } from "../src/types.ts";

export const NOW = 1_700_000_000_000;
export const VALID_START_SECONDS = 1_700_000_000;
export const VALID_START_NANOS = 123;

export const policy: ArenaTransferPolicy = {
  network: "hedera:testnet",
  tokenId: "0.0.5555",
  arenaAccountId: "0.0.2002",
  feePayerAccountId: "0.0.800",
  registeredAgentAccountId: "0.0.1001",
  stakeAmount: "100",
  maxTimeoutSeconds: 60,
  allowedNodeAccountIds: ["0.0.3", "0.0.4"],
  maxTransactionFeeTinybar: "200000000",
  minTransactionValidDurationSeconds: 30,
  maxTransactionValidDurationSeconds: 180,
  minRemainingLifetimeSeconds: 10,
  maxFutureStartSeconds: 15,
};

export const EXPECTED_TRANSACTION_ID = `${policy.feePayerAccountId}@${VALID_START_SECONDS}.${VALID_START_NANOS}`;

export type Body = Record<string, any>;

export function account(accountNum: number) {
  return { shardNum: 0, realmNum: 0, accountNum };
}

export function token(tokenNum: number) {
  return { shardNum: 0, realmNum: 0, tokenNum };
}

export function arenaBody(nodeAccountNum = 3): Body {
  return {
    transactionID: {
      accountID: account(800),
      transactionValidStart: { seconds: VALID_START_SECONDS, nanos: VALID_START_NANOS },
    },
    nodeAccountID: account(nodeAccountNum),
    transactionFee: 100_000_000,
    transactionValidDuration: { seconds: 120 },
    cryptoTransfer: {
      tokenTransfers: [
        {
          token: token(5555),
          transfers: [
            { accountID: account(1001), amount: -100 },
            { accountID: account(2002), amount: 100 },
          ],
        },
      ],
    },
  };
}

export function encodeBodies(bodies: Body[]): string {
  const transactionList = bodies.map((body) => ({
    signedTransactionBytes: proto.SignedTransaction.encode({
      bodyBytes: proto.TransactionBody.encode(body as never).finish(),
    }).finish(),
  }));
  return Buffer.from(proto.TransactionList.encode({ transactionList }).finish()).toString("base64");
}

export function arenaTransaction(mutate?: (body: Body) => void): string {
  const body = arenaBody();
  mutate?.(body);
  return encodeBodies([body]);
}

export function requirements(overrides: Partial<ExactRequirements> = {}): ExactRequirements {
  return {
    scheme: "exact",
    network: policy.network,
    amount: policy.stakeAmount,
    asset: policy.tokenId,
    payTo: policy.arenaAccountId,
    maxTimeoutSeconds: policy.maxTimeoutSeconds,
    extra: { feePayer: policy.feePayerAccountId },
    ...overrides,
  };
}

export function authorization(
  transaction: string,
  accepted: ExactRequirements = requirements()
): ExactAuthorization {
  return { x402Version: 2, accepted, payload: { transaction } };
}

export interface PaymentRequest {
  paymentPayload: ExactAuthorization;
  paymentRequirements: ExactRequirements;
}

export function payment(mutate?: (body: Body) => void): PaymentRequest {
  const transaction = arenaTransaction(mutate);
  return { paymentPayload: authorization(transaction), paymentRequirements: requirements() };
}

export function paymentFromTransaction(transaction: string): PaymentRequest {
  return { paymentPayload: authorization(transaction), paymentRequirements: requirements() };
}

export function encodeSignedBodies(
  bodies: Body[],
  signedOverrides: Record<string, unknown> = {}
): string {
  const transactionList = bodies.map((body) => ({
    signedTransactionBytes: proto.SignedTransaction.encode({
      bodyBytes: proto.TransactionBody.encode(body as never).finish(),
      ...signedOverrides,
    } as never).finish(),
  }));
  return Buffer.from(proto.TransactionList.encode({ transactionList }).finish()).toString("base64");
}

export function signaturePairs(count: number, signatureBytes = 64) {
  return Array.from({ length: count }, (_, i) => ({
    pubKeyPrefix: new Uint8Array([i + 1]),
    ed25519: new Uint8Array(signatureBytes).fill(i + 1),
  }));
}
