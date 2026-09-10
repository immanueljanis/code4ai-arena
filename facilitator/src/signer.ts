import {
  PrivateKey,
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  createHederaVerifyPayerSignature,
} from "@x402/hedera";
import type { FacilitatorConfig } from "./config.ts";
import type { FacilitatorSigner } from "./types.ts";

/**
 * SDK-backed fee payer. signAndSubmitTransaction resolves only after a SUCCESS
 * consensus receipt, so a resolved promise means the stake actually moved.
 */
export function hederaFacilitatorSigner(config: FacilitatorConfig): FacilitatorSigner {
  const feePayerKey = PrivateKey.fromStringECDSA(config.feePayerPrivateKey);
  const mirror = config.mirrorNodeUrl ? { mirrorNodeUrl: config.mirrorNodeUrl } : undefined;
  const verifyPayerSignature = createHederaVerifyPayerSignature(mirror);
  const preflightTransfer = createHederaPreflightTransfer(mirror);
  const signAndSubmitTransaction = createHederaSignAndSubmitTransaction(
    (network) => createHederaClient(network),
    feePayerKey
  );

  return {
    getAddresses: () => [config.feePayerAccountId],
    verifyPayerSignature,
    preflightTransfer,
    signAndSubmitTransaction,
  };
}
