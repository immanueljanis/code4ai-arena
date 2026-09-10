import { SQL } from "bun";
import type { DurableSettlementPermissions, SettlementReservation } from "./types.ts";

export async function initSettlementSchema(sql: SQL): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS facilitator_settlements (
    attempt_id TEXT PRIMARY KEY,
    payment_digest TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    receipt_transaction_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('broadcast_unknown', 'confirmed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS facilitator_settlement_transaction_unique
    ON facilitator_settlements (transaction_id)`;
}

/**
 * Durable, single-use settlement permission. A repeated call for the same
 * attempt and digest resumes the recorded reservation instead of broadcasting a
 * second payment; conflicting bytes under an existing identity are refused, so
 * a discarded VALID authorization can never be pushed through under another
 * attempt's permission.
 */
export function postgresSettlementPermissions(sql: SQL): DurableSettlementPermissions {
  return {
    async reserve(input): Promise<SettlementReservation> {
      const inserted = await sql`
        INSERT INTO facilitator_settlements (attempt_id, payment_digest, transaction_id, status)
        VALUES (${input.attemptId}, ${input.paymentDigest}, ${input.transactionId}, 'broadcast_unknown')
        ON CONFLICT DO NOTHING
        RETURNING status, transaction_id, receipt_transaction_id
      `;
      if (inserted.length) {
        return { status: "broadcast_unknown", transactionId: input.transactionId };
      }

      const rows = await sql`
        SELECT attempt_id, payment_digest, transaction_id, receipt_transaction_id, status
        FROM facilitator_settlements
        WHERE attempt_id = ${input.attemptId} OR transaction_id = ${input.transactionId}
      `;
      if (rows.length !== 1) throw new Error("settlement_identity_conflict");
      const row = rows[0] as Record<string, unknown>;
      if (
        row.attempt_id !== input.attemptId ||
        row.payment_digest !== input.paymentDigest ||
        row.transaction_id !== input.transactionId
      ) {
        throw new Error("settlement_identity_conflict");
      }
      return {
        status: row.status === "confirmed" ? "confirmed" : "broadcast_unknown",
        transactionId: (row.receipt_transaction_id as string) ?? (row.transaction_id as string),
      };
    },

    async markConfirmed(input): Promise<void> {
      const rows = await sql`
        UPDATE facilitator_settlements
        SET status = 'confirmed', receipt_transaction_id = ${input.receiptTransactionId}, updated_at = now()
        WHERE attempt_id = ${input.attemptId}
          AND payment_digest = ${input.paymentDigest}
          AND transaction_id = ${input.transactionId}
        RETURNING attempt_id
      `;
      if (rows.length !== 1) throw new Error("settlement_identity_conflict");
    },
  };
}
