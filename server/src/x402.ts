import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "./config.ts";

/** Payment requirements (accepted) — matches the facilitator's PaymentRequirementsV2. */
export interface X402Requirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: { name: string; version: string };
}

/**
 * A signed x402 v2 payment payload (facilitator's PaymentPayloadV2 shape):
 * `{ x402Version, accepted, payload: { authorization, signature } }`.
 */
export interface X402Authorization {
  x402Version: number;
  accepted: X402Requirements;
  payload: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
}

/**
 * Sign a USDC EIP-3009 `TransferWithAuthorization` for the stake, bound to
 * OUR Arena contract (payTo) and OUR USDC (verifyingContract). The EIP-712
 * domain uses name "USDC", version "2", chain 296 — the EIP-712 domain a
 * Circle FiatToken USDC expects.
 *
 * The server holds the agent's wallet (custody mode), so it can sign on the
 * agent's behalf. Returns the `X402Authorization` payload for /settle.
 */
export async function signStakeAuthorization(
  agentKey: `0x${string}`,
  payTo: string = serverConfig.arenaAddress,
  amountAtomic: string = "1000000" // 1 USDC
): Promise<X402Authorization> {
  const account = privateKeyToAccount(agentKey);
  const now = Math.floor(Date.now() / 1000);
  const nonce = `0x${createHash("sha256").update(`${account.address}:${now}:${Math.random()}`).digest("hex")}`;

  const authorization = {
    from: account.address,
    to: payTo,
    value: amountAtomic,
    validAfter: String(now - 60), // tolerate clock skew
    validBefore: String(now + 900), // 15 minutes
    nonce,
  };

  const signature = await account.signTypedData({
    domain: {
      name: "USDC",
      version: "2",
      chainId: serverConfig.chainId,
      verifyingContract: serverConfig.usdcAddress as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address,
      to: payTo as `0x${string}`,
      value: BigInt(amountAtomic),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: nonce as `0x${string}`,
    },
  });

  return {
    x402Version: 2,
    accepted: {
      scheme: "exact", // facilitator /supported: scheme id is "exact" (not v2-eip155-exact)
      network: `eip155:${serverConfig.chainId}`,
      amount: amountAtomic,
      asset: serverConfig.usdcAddress,
      payTo,
      maxTimeoutSeconds: 300,
      extra: { name: "USDC", version: "2" },
    },
    payload: { authorization, signature },
  };
}

/**
 * Settle a signed x402 authorization via the x402 facilitator (exact scheme).
 * The facilitator pays gas and executes `transferWithAuthorization` on USDC.
 * Body shape (verified against the live facilitator): the payment payload
 * MUST embed `accepted`, and `paymentRequirements` is sent alongside it.
 * Returns the settlement tx hash; throws on facilitator failure.
 */
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

  const data = (await res.json()) as { success: boolean; transaction?: string; errorReason?: string };
  if (!data.success) {
    throw new Error(`x402 settle failed: ${data.errorReason ?? "unknown facilitator error"}`);
  }
  if (!data.transaction) {
    throw new Error("x402 settle succeeded but returned no transaction hash");
  }
  return data.transaction;
}

/**
 * VALID verdict: never settle — the signed authorization simply expires.
 * Zero facilitator calls on valid attempts.
 */
export function discardAuthorization(_authorization: X402Authorization): void {
  // No-op on purpose.
}
