import { describe, expect, it } from "bun:test";
import { discardAuthorization, settleStakeAuthorization } from "../src/x402.ts";

const FACILITATOR = "https://facilitator.blockydevs.com";

const sampleAuth = {
  x402Version: 2,
  payload: {
    authorization: {
      from: "0x7e369e5CbceB1775cf40678fbe5DDE57b59EC496",
      to: "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0",
      value: "1000000",
      validAfter: "100",
      validBefore: "99999",
      nonce: "0xabc",
    },
    signature: "0x" + "aa".repeat(65),
  },
  accepted: {
    scheme: "exact",
    network: "eip155:296",
    amount: "1000000",
    asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    payTo: "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0",
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2" },
  },
};

describe("settleStakeAuthorization", () => {
  it("posts the exact-scheme payload to the facilitator /settle and returns the tx hash", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};

    // @ts-expect-error - fetch is swapped per-test
    globalThis.fetch = async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ success: true, transaction: "0x" + "12".repeat(32) }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const tx = await settleStakeAuthorization(sampleAuth, FACILITATOR);

    expect(capturedUrl).toBe(`${FACILITATOR}/settle`);
    expect(tx).toBe("0x" + "12".repeat(32));
    expect(capturedBody).toMatchObject({ x402Version: 2 });
    // The facilitator expects { x402Version, paymentPayload, paymentRequirements }.
    const paymentPayload = capturedBody.paymentPayload as Record<string, unknown>;
    const paymentRequirements = capturedBody.paymentRequirements as Record<string, unknown>;
    expect(paymentPayload.x402Version).toBe(2);
    const accepted = paymentPayload.accepted as Record<string, unknown>;
    expect(accepted.scheme).toBe("exact");
    expect(accepted.asset).toBe("0x534b2f3A21130d7a60830c2Df862319e593943A3");
    expect(accepted.amount).toBe("1000000");
    expect(accepted.payTo).toBe("0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0");
    expect(paymentRequirements).toMatchObject({
      scheme: "exact",
      asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
      amount: "1000000",
    });
  });

  it("throws when the facilitator reports failure", async () => {
    // @ts-expect-error - fetch is swapped per-test
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ success: false, errorReason: "bad_signature" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    expect(settleStakeAuthorization(sampleAuth, FACILITATOR)).rejects.toThrow(
      /bad_signature/
    );
  });

  it("throws on non-2xx facilitator responses", async () => {
    // @ts-expect-error - fetch is swapped per-test
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "nope" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });

    expect(settleStakeAuthorization(sampleAuth, FACILITATOR)).rejects.toThrow();
  });
});

describe("discardAuthorization", () => {
  it("is a no-op (the auth simply expires — never settle on VALID)", () => {
    expect(() => discardAuthorization(sampleAuth)).not.toThrow();
  });
});
