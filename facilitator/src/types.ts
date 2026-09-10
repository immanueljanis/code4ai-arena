export interface ExactRequirements {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string };
}

export interface ExactAuthorization {
  x402Version: 2;
  accepted: ExactRequirements;
  payload: { transaction: string };
}

export interface ArenaTransferPolicy {
  network: "hedera:testnet";
  tokenId: string;
  arenaAccountId: string;
  feePayerAccountId: string;
  registeredAgentAccountId?: string;
  stakeAmount: string;
  maxTimeoutSeconds: number;
  allowedNodeAccountIds: readonly string[];
  maxTransactionFeeTinybar: string;
  minTransactionValidDurationSeconds: number;
  maxTransactionValidDurationSeconds: number;
  minRemainingLifetimeSeconds: number;
  maxFutureStartSeconds: number;
}

export interface FacilitatorSigner {
  getAddresses(): readonly string[];
  verifyPayerSignature(params: {
    payer: string;
    transaction: string;
    network: string;
  }): Promise<{ ok: boolean; reason?: string; message?: string }>;
  preflightTransfer(params: {
    payer: string;
    payTo: string;
    asset: string;
    amount: string;
    network: string;
  }): Promise<{ ok: boolean; reason?: string; message?: string }>;
  signAndSubmitTransaction(
    transaction: string,
    feePayer: string,
    network: string
  ): Promise<{ transactionId: string }>;
}

export interface SettlementReservation {
  status: "broadcast_unknown" | "confirmed";
  transactionId: string;
}

export interface DurableSettlementPermissions {
  reserve(input: {
    attemptId: string;
    paymentDigest: string;
    transactionId: string;
  }): Promise<SettlementReservation>;
  markConfirmed(input: {
    attemptId: string;
    paymentDigest: string;
    transactionId: string;
    receiptTransactionId: string;
  }): Promise<void>;
}
