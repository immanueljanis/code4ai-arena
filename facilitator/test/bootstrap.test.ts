import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrivateKey } from "@hiero-ledger/sdk";
import { loadFacilitatorConfig } from "../src/config.ts";
import { initSettlementSchema, postgresSettlementPermissions } from "../src/permissions.ts";
import { createFacilitatorService } from "../src/service.ts";
import { hederaFacilitatorSigner } from "../src/signer.ts";
import { payment, policy, type Body } from "./helpers.ts";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";
const sql = new SQL(databaseUrl);

const key = PrivateKey.generateECDSA();

const env: Record<string, string | undefined> = {
  FACILITATOR_ACCOUNT_ID: "0.0.800",
  FACILITATOR_PRIVATE_KEY: key.toStringDer(),
  FACILITATOR_TOKEN_ID: "0.0.5555",
  FACILITATOR_STAKE_AMOUNT: "100",
  HEDERA_ARENA_ACCOUNT_ID: "0.0.2002",
  X402_SETTLEMENT_SECRET: "bootstrap-secret",
  DATABASE_URL: databaseUrl,
  FACILITATOR_MAX_TIMEOUT_SECONDS: String(policy.maxTimeoutSeconds),
  FACILITATOR_ALLOWED_NODE_ACCOUNT_IDS: policy.allowedNodeAccountIds.join(","),
  FACILITATOR_MAX_FEE_TINYBAR: policy.maxTransactionFeeTinybar,
  FACILITATOR_MIN_DURATION_SECONDS: String(policy.minTransactionValidDurationSeconds),
  FACILITATOR_MAX_DURATION_SECONDS: String(policy.maxTransactionValidDurationSeconds),
  FACILITATOR_MIN_REMAINING_SECONDS: String(policy.minRemainingLifetimeSeconds),
  FACILITATOR_MAX_FUTURE_START_SECONDS: String(policy.maxFutureStartSeconds),
};

beforeAll(async () => {
  await initSettlementSchema(sql);
});

afterAll(async () => {
  await sql.end();
});

/** Move a fixture transaction into the live validity window. */
function freshen(body: Body): void {
  body.transactionID.transactionValidStart = {
    seconds: Math.floor(Date.now() / 1000),
    nanos: 0,
  };
}

function verify(app: ReturnType<typeof boot>["app"], request: unknown) {
  return app.request("/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

/** Everything the entrypoint does, minus binding a port. */
function boot() {
  const config = loadFacilitatorConfig(env);
  return {
    config,
    app: createFacilitatorService({
      policy: config.policy,
      signer: hederaFacilitatorSigner(config),
      permissions: postgresSettlementPermissions(sql),
      settlementSecret: config.settlementSecret,
    }),
  };
}

describe("facilitator bootstrap", () => {
  test("builds the real SDK signer from a DER encoded fee payer key", () => {
    const config = loadFacilitatorConfig(env);
    const signer = hederaFacilitatorSigner(config);
    expect(signer.getAddresses()).toEqual([config.feePayerAccountId]);
  });

  test("accepts a raw hex fee payer key too", () => {
    const signer = hederaFacilitatorSigner(
      loadFacilitatorConfig({ ...env, FACILITATOR_PRIVATE_KEY: key.toStringRaw() })
    );
    expect(signer.getAddresses()).toEqual(["0.0.800"]);
  });

  test("refuses to start when the signer does not manage the policy fee payer", () => {
    expect(() =>
      createFacilitatorService({
        policy: { ...policy, feePayerAccountId: "0.0.9999" },
        signer: hederaFacilitatorSigner(loadFacilitatorConfig(env)),
        permissions: postgresSettlementPermissions(sql),
        settlementSecret: "bootstrap-secret",
      })
    ).toThrow("facilitator_fee_payer_not_managed");
  });

  test("creates the durable settlement table it needs", async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'facilitator_settlements'
    `;
    const columns = (rows as Array<{ column_name: string }>).map((r) => r.column_name).sort();
    expect(columns).toContain("attempt_id");
    expect(columns).toContain("payment_digest");
    expect(columns).toContain("transaction_id");
    expect(columns).toContain("status");
  });

  test("serves health and the supported scheme from a booted service", async () => {
    const { app, config } = boot();

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const supported = await app.request("/supported");
    expect(await supported.json()).toEqual({
      schemes: [{ scheme: "exact", network: config.network }],
    });
  });

  test("a booted service rejects an unauthenticated settlement", async () => {
    const { app } = boot();
    const response = await app.request("/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attemptId: "a", paymentDigest: "b", ...payment() }),
    });
    expect(response.status).toBe(401);
  });

  test("a booted service rejects a payment whose lifetime has run out", async () => {
    const { app } = boot();
    const response = await verify(app, payment());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errorReason: "invalid_transaction_lifetime" });
  });

  test("a booted service runs the validator before touching the network", async () => {
    const { app } = boot();
    const response = await verify(
      app,
      payment((body) => {
        freshen(body);
        body.cryptoTransfer.tokenTransfers[0].token = { shardNum: 0, realmNum: 0, tokenNum: 4242 };
      })
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errorReason: "token_mismatch" });
  });
});
