import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type {
  ArenaTransferPolicy,
  DurableSettlementPermissions,
  ExactAuthorization,
  ExactRequirements,
  FacilitatorSigner,
} from "./types.ts";
import { PaymentValidationError, paymentDigest, validateArenaPayment } from "./validator.ts";

export interface FacilitatorServiceOptions {
  policy: ArenaTransferPolicy;
  signer: FacilitatorSigner;
  permissions: DurableSettlementPermissions;
  settlementSecret: string;
  now?: () => number;
}

function unauthorized(secret: string, header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return true;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return candidate.length !== expected.length || !timingSafeEqual(candidate, expected);
}

function jsonError(c: { json: (value: unknown, status: 400 | 401 | 409 | 422 | 500) => Response }, status: 400 | 401 | 409 | 422 | 500, code: string) {
  return c.json({ success: false, errorReason: code }, status);
}

function asPayment(body: unknown): { authorization: ExactAuthorization; requirements: ExactRequirements } | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const authorization = value.paymentPayload as ExactAuthorization | undefined;
  const requirements = value.paymentRequirements as ExactRequirements | undefined;
  if (!authorization || !requirements) return null;
  return { authorization, requirements };
}

export function createFacilitatorService(options: FacilitatorServiceOptions) {
  if (!options.settlementSecret) throw new Error("settlement_secret_required");
  if (!options.signer.getAddresses().includes(options.policy.feePayerAccountId)) throw new Error("facilitator_fee_payer_not_managed");
  const app = new Hono();
  const now = options.now ?? Date.now;

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/supported", (c) => c.json({ schemes: [{ scheme: "exact", network: options.policy.network }] }));

  app.post("/verify", async (c) => {
    let payment: { authorization: ExactAuthorization; requirements: ExactRequirements } | null;
    try {
      payment = asPayment(await c.req.json());
    } catch {
      payment = null;
    }
    if (!payment) return jsonError(c, 400, "invalid_payment_request");
    try {
      const validated = validateArenaPayment(payment.authorization, payment.requirements, options.policy, now());
      const signature = await options.signer.verifyPayerSignature({
        payer: validated.payer,
        transaction: validated.transaction,
        network: options.policy.network,
      });
      if (!signature.ok) return jsonError(c, 422, "payer_signature_invalid");
      const preflight = await options.signer.preflightTransfer({
        payer: validated.payer,
        payTo: options.policy.arenaAccountId,
        asset: options.policy.tokenId,
        amount: options.policy.stakeAmount,
        network: options.policy.network,
      });
      if (!preflight.ok) return jsonError(c, 422, "payment_preflight_failed");
      return c.json({ isValid: true, payer: validated.payer, paymentDigest: validated.paymentDigest });
    } catch (error) {
      return jsonError(c, 422, error instanceof PaymentValidationError ? error.code : "payment_verification_failed");
    }
  });

  app.post("/settle", async (c) => {
    if (unauthorized(options.settlementSecret, c.req.header("authorization"))) return jsonError(c, 401, "unauthorized");
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return jsonError(c, 400, "invalid_settlement_request");
    }
    const payment = asPayment(body);
    const rawAttemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    const attemptId = /^[A-Za-z0-9_-]{1,64}$/.test(rawAttemptId) ? rawAttemptId : "";
    const claimedDigest = typeof body.paymentDigest === "string" ? body.paymentDigest : "";
    if (!payment || !attemptId || !claimedDigest) return jsonError(c, 400, "invalid_settlement_request");
    let validated;
    try {
      validated = validateArenaPayment(payment.authorization, payment.requirements, options.policy, now());
      if (claimedDigest !== validated.paymentDigest || paymentDigest(validated.transaction) !== claimedDigest) return jsonError(c, 409, "payment_digest_mismatch");
      const signature = await options.signer.verifyPayerSignature({
        payer: validated.payer,
        transaction: validated.transaction,
        network: options.policy.network,
      });
      if (!signature.ok) return jsonError(c, 422, "payer_signature_invalid");
      const preflight = await options.signer.preflightTransfer({
        payer: validated.payer,
        payTo: options.policy.arenaAccountId,
        asset: options.policy.tokenId,
        amount: options.policy.stakeAmount,
        network: options.policy.network,
      });
      if (!preflight.ok) return jsonError(c, 422, "payment_preflight_failed");
    } catch (error) {
      return jsonError(c, 422, error instanceof PaymentValidationError ? error.code : "payment_verification_failed");
    }
    let reservation;
    try {
      reservation = await options.permissions.reserve({
        attemptId,
        paymentDigest: validated.paymentDigest,
        transactionId: validated.transactionId,
      });
    } catch {
      return jsonError(c, 409, "settlement_not_authorized");
    }
    if (reservation.status === "confirmed") {
      return c.json({ success: true, payer: validated.payer, transaction: reservation.transactionId });
    }
    try {
      const settled = await options.signer.signAndSubmitTransaction(
        validated.transaction,
        options.policy.feePayerAccountId,
        options.policy.network
      );
      await options.permissions.markConfirmed({
        attemptId,
        paymentDigest: validated.paymentDigest,
        transactionId: validated.transactionId,
        receiptTransactionId: settled.transactionId,
      });
      return c.json({ success: true, payer: validated.payer, transaction: settled.transactionId });
    } catch {
      return jsonError(c, 500, "broadcast_unknown");
    }
  });

  return app;
}
