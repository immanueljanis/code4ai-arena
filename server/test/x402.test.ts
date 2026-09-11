import { describe, expect, it } from "bun:test";
import {
  discardAuthorization,
  settleStakeAuthorization,
  signStakeAuthorization,
} from "../src/x402.ts";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS =
  process.env.REHEARSAL_ARENA_ADDRESS ?? "0x5928df319b3D062203D6aF33A6797df4a96b18a4";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.SERVER_WALLET_SECRET = "test-secret";

const FACILITATOR = "https://api.testnet.blocky402.com";

const sampleAuth = {
  x402Version: 2 as const,
  payload: { transaction: "dGVzdC10cmFuc2FjdGlvbg==" },
  accepted: {
    scheme: "exact" as const,
    network: "hedera:testnet" as const,
    amount: "1000000",
    asset: "0.0.429274",
    payTo: "0.0.1234",
    maxTimeoutSeconds: 300,
    extra: { feePayer: "0.0.7162784" },
  },
};

describe("settleStakeAuthorization", () => {
  it("posts the Hedera exact payload to /settle and returns the Hedera tx id", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ success: true, transaction: "0.0.7162784@1700000000.000000000" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const tx = await settleStakeAuthorization(sampleAuth, FACILITATOR);

    expect(capturedUrl).toBe(`${FACILITATOR}/settle`);
    expect(tx).toBe("0.0.7162784@1700000000.000000000");
    expect(capturedBody).toMatchObject({ x402Version: 2 });
    const paymentPayload = capturedBody.paymentPayload as Record<string, unknown>;
    const paymentRequirements = capturedBody.paymentRequirements as Record<string, unknown>;
    expect(paymentPayload.x402Version).toBe(2);
    expect(paymentPayload.payload).toEqual(sampleAuth.payload);
    expect(paymentRequirements).toMatchObject({
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.429274",
      payTo: "0.0.1234",
      amount: "1000000",
      extra: { feePayer: "0.0.7162784" },
    });
  });

  it("throws when the facilitator reports failure", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: false, errorReason: "bad_signature" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    expect(settleStakeAuthorization(sampleAuth, FACILITATOR)).rejects.toThrow(/bad_signature/);
  });

  it("throws on non-2xx facilitator responses", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "nope" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });

    expect(settleStakeAuthorization(sampleAuth, FACILITATOR)).rejects.toThrow();
  });
});

describe("signStakeAuthorization", () => {
  it("creates a base64 partially-signed HTS transfer", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ account: "0.0.5678" }), { status: 200 });

    const payment = await signStakeAuthorization(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );

    expect(payment.x402Version).toBe(2);
    expect(payment.accepted.network).toBe("hedera:testnet");
    expect(payment.accepted.asset).toBe("0.0.429274");
    expect(payment.accepted.payTo).toBe("0.0.1234");
    expect(payment.payload.transaction).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(payment.payload.transaction.length).toBeGreaterThan(100);
  });
});

describe("discardAuthorization", () => {
  it("is a no-op: VALID never submits the payment", () => {
    expect(() => discardAuthorization(sampleAuth)).not.toThrow();
  });
});
