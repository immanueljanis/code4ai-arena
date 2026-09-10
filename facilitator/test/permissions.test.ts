import { SQL } from "bun";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { initSettlementSchema, postgresSettlementPermissions } from "../src/permissions.ts";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";
const sql = new SQL(databaseUrl);
const permissions = postgresSettlementPermissions(sql);

const DIGEST = "sha256:aaaa";
const TRANSACTION = "0.0.800@1700000000.000000001";

let attemptId: string;

async function conflictOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  await initSettlementSchema(sql);
});

beforeEach(() => {
  attemptId = crypto.randomUUID();
});

afterAll(async () => {
  await sql.end();
});

describe("durable settlement permissions", () => {
  test("first reservation for an attempt is a fresh broadcast", async () => {
    const reservation = await permissions.reserve({
      attemptId,
      paymentDigest: DIGEST,
      transactionId: `${TRANSACTION}-${attemptId}`,
    });
    expect(reservation).toEqual({
      status: "broadcast_unknown",
      transactionId: `${TRANSACTION}-${attemptId}`,
    });
  });

  test("re-reserving the same attempt and digest resumes rather than duplicating", async () => {
    const transactionId = `${TRANSACTION}-${attemptId}`;
    await permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId });
    const again = await permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId });
    expect(again.status).toBe("broadcast_unknown");

    await permissions.markConfirmed({
      attemptId,
      paymentDigest: DIGEST,
      transactionId,
      receiptTransactionId: `${transactionId}-receipt`,
    });
    const confirmed = await permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId });
    expect(confirmed).toEqual({
      status: "confirmed",
      transactionId: `${transactionId}-receipt`,
    });
  });

  test("refuses a different payment digest under an existing attempt", async () => {
    const transactionId = `${TRANSACTION}-${attemptId}`;
    await permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId });
    expect(
      await conflictOf(() => permissions.reserve({ attemptId, paymentDigest: "sha256:bbbb", transactionId }))
    ).toBe("settlement_identity_conflict");
  });

  test("refuses reusing one native transaction id under a second attempt", async () => {
    const transactionId = `${TRANSACTION}-${attemptId}`;
    await permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId });
    expect(
      await conflictOf(() =>
        permissions.reserve({ attemptId: crypto.randomUUID(), paymentDigest: DIGEST, transactionId })
      )
    ).toBe("settlement_identity_conflict");
  });

  test("refuses to confirm a reservation that was never made", async () => {
    expect(
      await conflictOf(() =>
        permissions.markConfirmed({
          attemptId,
          paymentDigest: DIGEST,
          transactionId: `${TRANSACTION}-${attemptId}`,
          receiptTransactionId: "receipt",
        })
      )
    ).toBe("settlement_identity_conflict");
  });

  test("only one of two concurrent reservations owns the broadcast", async () => {
    const transactionId = `${TRANSACTION}-${attemptId}`;
    const outcomes = await Promise.allSettled([
      permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId }),
      permissions.reserve({ attemptId, paymentDigest: DIGEST, transactionId }),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const rows = await sql`SELECT count(*)::int AS n FROM facilitator_settlements WHERE attempt_id = ${attemptId}`;
    expect((rows[0] as { n: number }).n).toBe(1);
  });
});
