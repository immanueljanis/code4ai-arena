import {
  AccountId,
  PrivateKey,
  createClientHederaSigner,
  createHederaClient,
} from "@x402/hedera";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "./config.ts";

const HEDERA_NETWORK = "hedera:testnet" as const;

export interface X402Requirements {
  scheme: "exact";
  network: typeof HEDERA_NETWORK;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string };
}

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

export async function resolveAgentAccountId(agentAddress: `0x${string}`): Promise<string> {
  const client = createHederaClient(HEDERA_NETWORK);
  try {
    return (await AccountId.fromEvmAddress(0, 0, agentAddress).populateAccountNum(client)).toString();
  } finally {
    client.close();
  }
}

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

export interface X402Verification {
  payer?: string;
  paymentDigest?: string;
}

/**
 * Read-only facilitator check of the signed payment: payer signature, token
 * association/balance preflight and the decoded transfer policy. Never submits.
 * Run this before proving so an unpayable stake cannot reach the exploit stage.
 */
export async function verifyStakeAuthorization(
  authorization: X402Authorization,
  facilitatorUrl: string = serverConfig.x402FacilitatorUrl
): Promise<X402Verification> {
  const res = await fetch(`${facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      x402Version: authorization.x402Version,
      paymentPayload: authorization,
      paymentRequirements: authorization.accepted,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    isValid?: boolean;
    payer?: string;
    paymentDigest?: string;
    errorReason?: string;
    errorMessage?: string;
  };
  if (!res.ok || data.isValid !== true) {
    throw Object.assign(
      new Error(
        `x402 verify rejected the stake payment: ${
          data.errorReason ?? data.errorMessage ?? `HTTP ${res.status}`
        }`
      ),
      { status: 402 }
    );
  }
  return { payer: data.payer, paymentDigest: data.paymentDigest };
}

/**
 * Submit the INVALID-verdict stake payment. `attemptId` and `paymentDigest`
 * bind the request to one journalled attempt so a replayed call settles at most
 * once; the bearer secret is what authorizes settlement at all.
 */
export async function settleStakeAuthorization(
  authorization: X402Authorization,
  attemptId?: string,
  paymentDigest?: string,
  payer?: string,
  facilitatorUrl: string = serverConfig.x402FacilitatorUrl
): Promise<string> {
  const secret = serverConfig.x402SettlementSecret;
  const res = await fetch(`${facilitatorUrl}/settle`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      x402Version: authorization.x402Version,
      paymentPayload: authorization,
      paymentRequirements: authorization.accepted,
      ...(attemptId ? { attemptId } : {}),
      ...(paymentDigest ? { paymentDigest } : {}),
      ...(payer ? { payer } : {}),
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

export function discardAuthorization(_authorization: X402Authorization): void {
}
