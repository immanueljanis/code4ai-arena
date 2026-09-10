import { beforeAll, describe, expect, it } from "bun:test";

process.env.HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";
process.env.HEDERA_USDC_TESTNET_ADDRESS = "0x0000000000000000000000000000000000068cda";
process.env.ARENA_ADDRESS = "0x8771D35f42e9cB46b7Ec55fb712DFEfC752f3ae0";
process.env.HEDERA_ARENA_ACCOUNT_ID = "0.0.1234";
process.env.ACCESS_CONTROL_VAULT_ADDRESS = "0x73524775e7c01E862F8d0E381D1154d7939cC160";
process.env.ROUNDING_VAULT_ADDRESS = "0x9Cb289aa00508D1B1eb8Aa1Eb21F552Eed4dA37A";
process.env.TIME_WINDOW_VAULT_ADDRESS = "0xFf608EC643D5c10204c20dfe1A2a43ebC45CcCEd";
process.env.VERIFIER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.SERVER_WALLET_SECRET = "test-secret";
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/code4ai";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const [{ initSchema }, { seedTargets }] = await Promise.all([
  import("../src/db.ts"),
  import("../src/contests.ts"),
]);
const { insertAgent, listSubmissions } = await import("../src/db.ts");
const { runSubmit } = await import("../src/agentRunner.ts");
const { encryptPrivateKey, generateAgentWallet } = await import("../src/wallet.ts");
import type { SubmitDeps } from "../src/agentRunner.ts";

beforeAll(async () => {
  await initSchema();
  await seedTargets();
});

const x402Auth = {
  x402Version: 2 as const,
  payload: { transaction: "dGVzdC10cmFuc2FjdGlvbg==" },
  accepted: {
    scheme: "exact",
    network: "hedera:testnet",
    amount: "1000000",
    asset: "0.0.429274",
    payTo: "0.0.1234",
    maxTimeoutSeconds: 300,
    extra: { feePayer: "0.0.7162784" },
  },
};

function mockDeps(verdict: "VALID" | "INVALID") {
  return {
    verify: async () => ({ verdict, exploitTxHash: "0x" + "aa".repeat(32) }),
    signAuth: async () => x402Auth,
    verifyAuth: async () => ({ payer: "0.0.4242", paymentDigest: "sha256:test-digest" }),
    resolvePayer: async () => "0.0.4242",
    settleAuth: async () => "0x" + "bb".repeat(32),
    discardAuth: () => {},
    doPayout: async () => "0x" + "dd".repeat(32),
    doSlash: async () => "0x" + "ee".repeat(32),
    writeFeedback: async () => "0x" + "cc".repeat(32),
    fundAgent: async () => null,
  } as SubmitDeps;
}

describe("runSubmit — VALID verdict", () => {
  it("discards the auth, pays stake+bounty, persists VALID submission", async () => {
    const wallet = generateAgentWallet();
    const agentId = await insertAgent({
      label: "val-agent",
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, "test-secret"),
      erc8004TokenId: "mock-id:val",
    });

    const deps = mockDeps("VALID");
    // No client-signed auth: the server signs the stake authorization itself
    // (custody mode) — deps.signAuth is used.
    const result = await runSubmit(agentId, "access-control-vault", [
      {
        caller: "0xa11ce00000000000000000000000000000000000",
        entryPoint: "setOwner",
        args: {},
      },
    ], undefined, deps);

    expect(result.verdict).toBe("VALID");
    expect(result.exploitTxHash).toBe("0x" + "aa".repeat(32));
    expect(result.settlementTxHash).toBe("0x" + "dd".repeat(32));
    expect(result.reputationTxHash).toBe("0x" + "cc".repeat(32));

    const subs = await listSubmissions(10);
    const mine = subs.find((s) => s.id === result.submissionId);
    expect(mine).toBeDefined();
    expect(mine!.verdict).toBe("VALID");
    expect(mine!.exploitTxHash).toBe("0x" + "aa".repeat(32));
    expect(mine!.settlementTxHash).toBe("0x" + "dd".repeat(32));
    expect(mine!.reputationTxHash).toBe("0x" + "cc".repeat(32));
  }, 30000);
});
