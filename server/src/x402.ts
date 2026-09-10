/**
 * Hedera x402 spike (pinned to @x402/hedera 2.25.0):
 * - `ExactHederaScheme` creates a v2 payload whose scheme payload is
 *   `{ transaction: base64 }`, a frozen `TransferTransaction` signed only by
 *   the payer. The facilitator adds its fee-payer signature and submits it.
 * - Hedera requirements use CAIP-2 `hedera:testnet`, HTS token ID / account ID
 *   values, and `extra.feePayer`; EVM addresses are only used by the contract
 *   transaction layer and are not valid payment requirement values.
 * - Settlement is the standard facilitator `POST /settle` body with
 *   `paymentPayload` and `paymentRequirements`; success returns a Hedera
 *   transaction ID in `transaction`.
 */

import {
  AccountId,
  PrivateKey,
  createClientHederaSigner,
  createHederaClient,
} from "@x402/hedera";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "./config.ts";

const HEDERA_NETWORK = "hedera:testnet" as const;

/** Payment requirements accepted by the Hedera x402 exact scheme. */
export interface X402Requirements {
  scheme: "exact";
  network: typeof HEDERA_NETWORK;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string };
}

/** x402 v2 payload with a partially-signed Hedera transfer. */
export interface X402Authorization {
  x402Version: 2;
  accepted: X402Requirements;
  payload: {
    transaction: string;
  };
}

function asHederaAccountId(value: string): string {
  if (/^\d+\.\d+\.\d+$/.test(value)) return AccountId.fromString(value).toString();
  if (value.toLowerCase() === serverConfig.arenaAddress.toLowerCase()) {
    return serverConfig.hederaArenaAccountId;
  }
  return AccountId.fromEvmAddress(0, 0, value).toString();
}

/** Build the exact requirements that server and client payments must match. */
export function stakePaymentRequirements(
  payTo: string = serverConfig.hederaArenaAccountId,
  amountAtomic: string = "1000000"
): X402Requirements {
  return {
    scheme: "exact",
    network: HEDERA_NETWORK,
    amount: amountAtomic,
    asset: serverConfig.hederaUsdcTokenId,
    payTo: asHederaAccountId(payTo),
    maxTimeoutSeconds: 300,
    extra: { feePayer: serverConfig.hederaFacilitatorAccountId },
  };
}

async function resolveAgentAccountId(agentAddress: `0x${string}`): Promise<string> {
  const client = createHederaClient(HEDERA_NETWORK);
  try {
    // Agent wallets are created in EVM form. Mirror Node resolves that alias
    // to the concrete Hedera account required by facilitator verification.
    return (await AccountId.fromEvmAddress(0, 0, agentAddress).populateAccountNum(client)).toString();
  } finally {
    client.close();
  }
}

/**
 * Create an HTS-USDC transfer signed by the agent but incomplete until the
 * facilitator adds its fee-payer signature and submits it.
 */
export async function signStakeAuthorization(
  agentKey: `0x${string}`,
  payTo: string = serverConfig.hederaArenaAccountId,
  amountAtomic: string = "1000000"
): Promise<X402Authorization> {
  const payerAccountId = await resolveAgentAccountId(privateKeyToAccount(agentKey).address);
  const requirements = stakePaymentRequirements(payTo, amountAtomic);
  const signer = createClientHederaSigner(
    payerAccountId,
    PrivateKey.fromStringECDSA(agentKey),
    { network: HEDERA_NETWORK }
  );
  const transaction = await signer.createPartiallySignedTransferTransaction(requirements);

  return {
    x402Version: 2,
    accepted: requirements,
    payload: { transaction },
  };
}

/** Settle the captured Hedera payment exactly once through the facilitator. */
export async function settleStakeAuthorization(
  authorization: X402Authorization,
  facilitatorUrl: string = serverConfig.x402FacilitatorUrl
): Promise<string> {
  const res = await fetch(`${facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      x402Version: authorization.x402Version,
      paymentPayload: authorization,
      paymentRequirements: authorization.accepted,
    }),
  });

  if (!res.ok) {
    throw new Error(`x402 settle failed: HTTP ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    success: boolean;
    transaction?: string;
    errorReason?: string;
    errorMessage?: string;
  };
  if (!data.success) {
    throw new Error(
      `x402 settle failed: ${data.errorReason ?? data.errorMessage ?? "unknown facilitator error"}`
    );
  }
  if (!data.transaction) {
    throw new Error("x402 settle succeeded but returned no Hedera transaction ID");
  }
  return data.transaction;
}

/** VALID verdict: do not submit; the partially-signed payment expires unused. */
export function discardAuthorization(_authorization: X402Authorization): void {
  // Intentionally empty: VALID never calls the facilitator.
}
