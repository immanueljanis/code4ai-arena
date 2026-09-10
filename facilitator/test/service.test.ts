import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createFacilitatorService } from "../src/service.ts";
import type {
  DurableSettlementPermissions,
  FacilitatorSigner,
  SettlementReservation,
} from "../src/types.ts";
import { validateArenaPayment } from "../src/validator.ts";
import { NOW, account, payment, policy, type Body, type PaymentRequest } from "./helpers.ts";

const SECRET = "test-settlement-secret";
const RECEIPT_TRANSACTION_ID = "0.0.800@1700000000.000000123";

interface Stubs {
  signer: FacilitatorSigner;
  permissions: DurableSettlementPermissions;
  verifyPayerSignature: ReturnType<typeof mock>;
  preflightTransfer: ReturnType<typeof mock>;
  signAndSubmitTransaction: ReturnType<typeof mock>;
  reserve: ReturnType<typeof mock>;
  markConfirmed: ReturnType<typeof mock>;
}

function stubs(overrides: {
  addresses?: readonly string[];
  signature?: { ok: boolean; reason?: string };
  preflight?: { ok: boolean; reason?: string };
  submit?: () => Promise<{ transactionId: string }>;
  reservation?: () => Promise<SettlementReservation>;
} = {}): Stubs {
  const verifyPayerSignature = mock(async () => overrides.signature ?? { ok: true });
  const preflightTransfer = mock(async () => overrides.preflight ?? { ok: true });
  const signAndSubmitTransaction = mock(
    overrides.submit ?? (async () => ({ transactionId: RECEIPT_TRANSACTION_ID }))
  );
  const reserve = mock(
    overrides.reservation ??
      (async () => ({ status: "broadcast_unknown", transactionId: RECEIPT_TRANSACTION_ID }) as SettlementReservation)
  );
  const markConfirmed = mock(async () => undefined);
  return {
    signer: {
      getAddresses: () => overrides.addresses ?? [policy.feePayerAccountId],
      verifyPayerSignature,
      preflightTransfer,
      signAndSubmitTransaction,
    } as unknown as FacilitatorSigner,
    permissions: { reserve, markConfirmed } as unknown as DurableSettlementPermissions,
    verifyPayerSignature,
    preflightTransfer,
    signAndSubmitTransaction,
    reserve,
    markConfirmed,
  };
}

function service(stub: Stubs, settlementSecret = SECRET) {
  return createFacilitatorService({
    policy,
    signer: stub.signer,
    permissions: stub.permissions,
    settlementSecret,
    now: () => NOW,
  });
}

function post(app: ReturnType<typeof service>, path: string, body: unknown, secret?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
}

function digestOf(request: PaymentRequest): string {
  return validateArenaPayment(request.paymentPayload, request.paymentRequirements, policy, NOW).paymentDigest;
}

function settlementBody(request: PaymentRequest, overrides: Record<string, unknown> = {}) {
  return {
    paymentPayload: request.paymentPayload,
    paymentRequirements: request.paymentRequirements,
    attemptId: "attempt-1",
    paymentDigest: digestOf(request),
    ...overrides,
  };
}

let stub: Stubs;

beforeEach(() => {
  stub = stubs();
});

describe("service construction", () => {
  test("throws when the settlement secret is empty", () => {
    expect(() => service(stubs(), "")).toThrow("settlement_secret_required");
  });

  test("throws when the signer does not manage the policy fee payer", () => {
    expect(() => service(stubs({ addresses: ["0.0.4004"] }))).toThrow("facilitator_fee_payer_not_managed");
  });

  test("builds when the signer manages the policy fee payer", () => {
    expect(() => service(stubs({ addresses: ["0.0.4004", policy.feePayerAccountId] }))).not.toThrow();
  });
});

describe("read only endpoints", () => {
  test("health reports ok", async () => {
    const response = await service(stub).request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("supported lists the exact scheme on the policy network", async () => {
    const response = await service(stub).request("/supported");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemes: [{ scheme: "exact", network: policy.network }] });
  });
});

describe("POST /verify", () => {
  test("accepts a valid payment without submitting anything", async () => {
    const request = payment();
    const response = await post(service(stub), "/verify", request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isValid: true,
      payer: policy.registeredAgentAccountId,
      paymentDigest: digestOf(request),
    });
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
    expect(stub.reserve).not.toHaveBeenCalled();
    expect(stub.markConfirmed).not.toHaveBeenCalled();
  });

  test("checks the payer signature and the preflight against the policy", async () => {
    await post(service(stub), "/verify", payment());
    expect(stub.verifyPayerSignature).toHaveBeenCalledTimes(1);
    expect(stub.verifyPayerSignature.mock.calls[0][0]).toEqual({
      payer: policy.registeredAgentAccountId,
      transaction: payment().paymentPayload.payload.transaction,
      network: policy.network,
    });
    expect(stub.preflightTransfer.mock.calls[0][0]).toEqual({
      payer: policy.registeredAgentAccountId,
      payTo: policy.arenaAccountId,
      asset: policy.tokenId,
      amount: policy.stakeAmount,
      network: policy.network,
    });
  });

  test("returns the validator error code for a policy violating payment", async () => {
    const request = payment((body: Body) => {
      body.nodeAccountID = account(9);
    });
    const response = await post(service(stub), "/verify", request);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ success: false, errorReason: "node_account_not_allowed" });
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("returns 422 when the payer signature is rejected", async () => {
    const rejecting = stubs({ signature: { ok: false, reason: "bad_signature" } });
    const response = await post(service(rejecting), "/verify", payment());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ success: false, errorReason: "payer_signature_invalid" });
    expect(rejecting.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("returns 422 when the preflight fails", async () => {
    const failing = stubs({ preflight: { ok: false, reason: "insufficient_balance" } });
    const response = await post(service(failing), "/verify", payment());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ success: false, errorReason: "payment_preflight_failed" });
    expect(failing.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("returns 400 for a request that is not a payment", async () => {
    const response = await post(service(stub), "/verify", { nope: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, errorReason: "invalid_payment_request" });
  });
});

describe("POST /settle authentication", () => {
  test("rejects a request with no authorization header", async () => {
    const response = await post(service(stub), "/settle", settlementBody(payment()));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, errorReason: "unauthorized" });
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("rejects a wrong secret of the same length", async () => {
    const wrong = `${"x".repeat(SECRET.length - 1)}y`;
    expect(wrong.length).toBe(SECRET.length);
    const response = await post(service(stub), "/settle", settlementBody(payment()), wrong);
    expect(response.status).toBe(401);
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("rejects a secret that differs only by length", async () => {
    const response = await post(service(stub), "/settle", settlementBody(payment()), `${SECRET}x`);
    expect(response.status).toBe(401);
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("rejects a secret that is a prefix of the real secret", async () => {
    const response = await post(service(stub), "/settle", settlementBody(payment()), SECRET.slice(0, -1));
    expect(response.status).toBe(401);
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("rejects an authorization header that is not a bearer token", async () => {
    const app = service(stub);
    const response = await app.request("/settle", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: SECRET },
      body: JSON.stringify(settlementBody(payment())),
    });
    expect(response.status).toBe(401);
  });
});

describe("POST /settle", () => {
  test("rejects a payment digest that does not match the transaction", async () => {
    const body = settlementBody(payment(), { paymentDigest: `sha256:${"0".repeat(64)}` });
    const response = await post(service(stub), "/settle", body, SECRET);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, errorReason: "payment_digest_mismatch" });
    expect(stub.reserve).not.toHaveBeenCalled();
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("rejects a settlement request with no attempt id", async () => {
    const body = settlementBody(payment(), { attemptId: "" });
    const response = await post(service(stub), "/settle", body, SECRET);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, errorReason: "invalid_settlement_request" });
  });

  test("returns the validator error code for a policy violating payment", async () => {
    const request = payment((body: Body) => {
      body.cryptoTransfer.tokenTransfers[0].transfers[0].isApproval = true;
    });
    const body = {
      paymentPayload: request.paymentPayload,
      paymentRequirements: request.paymentRequirements,
      attemptId: "attempt-1",
      paymentDigest: `sha256:${"0".repeat(64)}`,
    };
    const response = await post(service(stub), "/settle", body, SECRET);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ success: false, errorReason: "allowance_or_hook_not_allowed" });
    expect(stub.signAndSubmitTransaction).not.toHaveBeenCalled();
  });

  test("refuses to settle when the durable permission reservation throws", async () => {
    const denied = stubs({
      reservation: async () => {
        throw new Error("attempt already spent");
      },
    });
    const response = await post(service(denied), "/settle", settlementBody(payment()), SECRET);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, errorReason: "settlement_not_authorized" });
    expect(denied.signAndSubmitTransaction).not.toHaveBeenCalled();
    expect(denied.markConfirmed).not.toHaveBeenCalled();
  });

  test("replays a confirmed reservation without submitting again", async () => {
    const replay = stubs({
      reservation: async () => ({ status: "confirmed", transactionId: "0.0.800@1699999999.000000001" }),
    });
    const response = await post(service(replay), "/settle", settlementBody(payment()), SECRET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      payer: policy.registeredAgentAccountId,
      transaction: "0.0.800@1699999999.000000001",
    });
    expect(replay.signAndSubmitTransaction).not.toHaveBeenCalled();
    expect(replay.markConfirmed).not.toHaveBeenCalled();
  });

  test("submits once and confirms the same attempt and digest", async () => {
    const request = payment();
    const digest = digestOf(request);
    const response = await post(service(stub), "/settle", settlementBody(request), SECRET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      payer: policy.registeredAgentAccountId,
      transaction: RECEIPT_TRANSACTION_ID,
    });
    expect(stub.signAndSubmitTransaction).toHaveBeenCalledTimes(1);
    expect(stub.signAndSubmitTransaction.mock.calls[0]).toEqual([
      request.paymentPayload.payload.transaction,
      policy.feePayerAccountId,
      policy.network,
    ]);
    expect(stub.reserve.mock.calls[0][0]).toEqual({
      attemptId: "attempt-1",
      paymentDigest: digest,
      transactionId: "0.0.800@1700000000.123",
    });
    expect(stub.markConfirmed).toHaveBeenCalledTimes(1);
    expect(stub.markConfirmed.mock.calls[0][0]).toEqual({
      attemptId: "attempt-1",
      paymentDigest: digest,
      transactionId: "0.0.800@1700000000.123",
      receiptTransactionId: RECEIPT_TRANSACTION_ID,
    });
  });

  test("reports broadcast_unknown and skips confirmation when submission throws", async () => {
    const broken = stubs({
      submit: async () => {
        throw new Error("network unreachable");
      },
    });
    const response = await post(service(broken), "/settle", settlementBody(payment()), SECRET);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, errorReason: "broadcast_unknown" });
    expect(broken.signAndSubmitTransaction).toHaveBeenCalledTimes(1);
    expect(broken.markConfirmed).not.toHaveBeenCalled();
  });
});

describe("settlement attempt identity", () => {
  test("rejects an attempt id outside the accepted identifier shape", async () => {
    const request = payment();
    for (const attemptId of ["", "a".repeat(65), "has space", "drop/slash", "semi;colon"]) {
      const local = stubs();
      const response = await post(
        service(local),
        "/settle",
        settlementBody(request, { attemptId }),
        SECRET
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errorReason: "invalid_settlement_request" });
      expect(local.reserve).not.toHaveBeenCalled();
      expect(local.signAndSubmitTransaction).not.toHaveBeenCalled();
    }
  });

  test("accepts a uuid attempt id", async () => {
    const response = await post(
      service(stub),
      "/settle",
      settlementBody(payment(), { attemptId: crypto.randomUUID() }),
      SECRET
    );
    expect(response.status).toBe(200);
  });
});
