import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PrivateKey, TokenType } from "@hiero-ledger/sdk";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
import {
  DEFAULT_INITIAL_SUPPLY,
  DEMO_HTS_DECIMALS,
  DEMO_HTS_MEMO,
  DEMO_HTS_NAME,
  DEMO_HTS_SYMBOL,
  type LedgerClient,
  type ProvisioningConfig,
  type TokenInfo,
  assertDemoToken,
  buildTokenCreateTransaction,
  isHederaId,
  loadProvisioningConfig,
  provisionDemoHts,
  readProvisioningState,
  tokenFacadeAddress,
  writeProvisioningState,
} from "../scripts/demo-hts-provisioning.ts";

const PROVISIONED_TOKEN_ID = "0.0.5005";

function keyText(): string {
  return PrivateKey.generateED25519().toString();
}

function env(): Record<string, string> {
  return {
    DEMO_HTS_OPERATOR_ACCOUNT_ID: "0.0.1001",
    DEMO_HTS_OPERATOR_PRIVATE_KEY: keyText(),
    DEMO_HTS_TREASURY_ACCOUNT_ID: "0.0.1002",
    DEMO_HTS_TREASURY_PRIVATE_KEY: keyText(),
    DEMO_HTS_SUPPLY_PRIVATE_KEY: keyText(),
  };
}

function envWithRecipient(): Record<string, string> {
  return {
    ...env(),
    DEMO_HTS_RECIPIENT_ACCOUNT_ID: "0.0.1003",
    DEMO_HTS_RECIPIENT_PRIVATE_KEY: keyText(),
    DEMO_HTS_RECIPIENT_AMOUNT: "2500000",
  };
}

function demoTokenInfo(config: ProvisioningConfig): TokenInfo {
  return {
    decimals: DEMO_HTS_DECIMALS,
    name: DEMO_HTS_NAME,
    symbol: DEMO_HTS_SYMBOL,
    tokenMemo: DEMO_HTS_MEMO,
    tokenType: TokenType.FungibleCommon,
    customFees: [],
    kycKey: null,
    freezeKey: null,
    pauseKey: null,
    wipeKey: null,
    supplyKey: config.supplyKey.publicKey,
    treasuryAccountId: { toString: () => config.treasuryAccountId },
  };
}

function ledgerStub(
  config: ProvisioningConfig,
  options: { alreadyAssociated?: boolean; info?: Partial<TokenInfo>; failTokenInfo?: boolean } = {},
): { ledger: LedgerClient; calls: string[] } {
  const calls: string[] = [];
  const ledger: LedgerClient = {
    async hbarTinybars(accountId) {
      calls.push(`hbarTinybars:${accountId}`);
      return "250000000";
    },
    async createToken() {
      calls.push("createToken");
      return PROVISIONED_TOKEN_ID;
    },
    async tokenInfo(tokenId) {
      calls.push(`tokenInfo:${tokenId}`);
      if (options.failTokenInfo) throw new Error("mirror node unavailable");
      return { ...demoTokenInfo(config), ...options.info };
    },
    async hasTokenAssociation(accountId, tokenId) {
      calls.push(`hasTokenAssociation:${accountId}:${tokenId}`);
      return options.alreadyAssociated ?? false;
    },
    async associateToken(tokenId, accountId) {
      calls.push(`associateToken:${accountId}:${tokenId}`);
    },
    async transferToken(tokenId, fromAccountId, toAccountId, amount) {
      calls.push(`transferToken:${fromAccountId}->${toAccountId}:${amount}:${tokenId}`);
    },
  };
  return { ledger, calls };
}

async function captureConsole<T>(run: () => Promise<T>): Promise<{ result: T; output: string }> {
  const originalLog = console.log;
  const originalError = console.error;
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.log = record;
  console.error = record;
  try {
    const result = await run();
    return { result, output: lines.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

let workingDirectory: string;
let statePath: string;

beforeEach(async () => {
  workingDirectory = await mkdtemp(path.join(tmpdir(), "demo-hts-"));
  statePath = path.join(workingDirectory, "nested", ".demo-hts-provisioning.json");
});

afterEach(async () => {
  await rm(workingDirectory, { recursive: true, force: true });
});

describe("DemoUSD provisioning identity", () => {
  it("accepts only canonical positive signed 64-bit entity IDs", () => {
    expect(isHederaId("0.0.1")).toBe(true);
    expect(isHederaId("0.0.9223372036854775807")).toBe(true);
    expect(isHederaId("0.0.0")).toBe(false);
    expect(isHederaId("0.0.1\n")).toBe(false);
    expect(isHederaId("0.0.9223372036854775808")).toBe(false);
  });

  it("derives the token facade address exactly as the server config derives it", () => {
    const serverEnv = {
      HEDERA_TESTNET_RPC_URL: "https://testnet.hashio.io/api",
      ARENA_ADDRESS: "0x0000000000000000000000000000000000068cda",
      HEDERA_ARENA_ACCOUNT_ID: "0.0.1234",
      ACCESS_CONTROL_VAULT_ADDRESS: "0x0000000000000000000000000000000000068cda",
      ROUNDING_VAULT_ADDRESS: "0x0000000000000000000000000000000000068cda",
      TIME_WINDOW_VAULT_ADDRESS: "0x0000000000000000000000000000000000068cda",
      VERIFIER_KEY: `0x${"1".repeat(64)}`,
      SERVER_WALLET_SECRET: "test-only",
      SETTLEMENT_PROFILE: "demo-hts",
      X402_FACILITATOR_URL: "http://localhost:4020",
      X402_FACILITATOR_ACCOUNT_ID: "0.0.1235",
      X402_SETTLEMENT_SECRET: "test-settlement-secret",
    };
    for (const tokenId of ["0.0.1", "0.0.429274", "0.0.1234567", "0.0.9223372036854775807"]) {
      const config = loadConfig({ ...serverEnv, DEMO_HTS_TOKEN_ID: tokenId });
      expect(tokenFacadeAddress(tokenId)).toBe(config.settlementTokenAddress);
      expect(config.settlementDecimals).toBe(DEMO_HTS_DECIMALS);
    }
    expect(() =>
      loadConfig({
        ...serverEnv,
        DEMO_HTS_TOKEN_ID: "0.0.1234567",
        DEMO_HTS_TOKEN_ADDRESS: tokenFacadeAddress("0.0.1234567"),
      }),
    ).not.toThrow();
    expect(() => tokenFacadeAddress("0.0.0")).toThrow("positive signed 64-bit");
  });

  it("labels the token as a test token and never as Circle USDC", () => {
    expect(DEMO_HTS_NAME).toContain("Test");
    expect(DEMO_HTS_SYMBOL).not.toBe("USDC");
    expect(DEMO_HTS_MEMO).toContain("TEST");
    expect(DEMO_HTS_MEMO).toContain("Not Circle USDC");
    expect(DEMO_HTS_MEMO).toContain("Not redeemable");
    expect(Buffer.byteLength(DEMO_HTS_MEMO, "utf8")).toBeLessThanOrEqual(100);
    for (const text of [DEMO_HTS_NAME, DEMO_HTS_SYMBOL]) {
      expect(text.toLowerCase()).not.toContain("circle");
      expect(text.toLowerCase()).not.toContain("dollar");
    }
  });
});

describe("DemoUSD token construction", () => {
  it("constructs a six-decimal fungible token without optional control keys or fees", () => {
    const transaction = buildTokenCreateTransaction(loadProvisioningConfig(env()));
    expect(transaction.tokenName).toBe(DEMO_HTS_NAME);
    expect(transaction.tokenSymbol).toBe(DEMO_HTS_SYMBOL);
    expect(transaction.tokenMemo).toBe(DEMO_HTS_MEMO);
    expect(transaction.decimals?.toString()).toBe(String(DEMO_HTS_DECIMALS));
    expect(transaction.tokenType?.toString()).toBe(TokenType.FungibleCommon.toString());
    expect(transaction.initialSupply?.toString()).toBe(DEFAULT_INITIAL_SUPPLY.toString());
    expect(transaction.customFees).toEqual([]);
    expect(transaction.kycKey).toBeNull();
    expect(transaction.freezeKey).toBeNull();
    expect(transaction.pauseKey).toBeNull();
    expect(transaction.wipeKey).toBeNull();
    expect(transaction.feeScheduleKey).toBeNull();
  });

  it("assigns a supply key that is neither the operator nor the treasury key", () => {
    const config = loadProvisioningConfig(env());
    const transaction = buildTokenCreateTransaction(config);
    expect(transaction.supplyKey?.toString()).toBe(config.supplyKey.publicKey.toString());
    expect(transaction.supplyKey?.toString()).not.toBe(config.operatorKey.publicKey.toString());
    expect(transaction.supplyKey?.toString()).not.toBe(config.treasuryKey.publicKey.toString());
    expect(transaction.treasuryAccountId?.toString()).toBe(config.treasuryAccountId);
  });

  it("requires the supply key to be distinct from every runtime key", () => {
    const supplyIsOperator = env();
    supplyIsOperator.DEMO_HTS_SUPPLY_PRIVATE_KEY = supplyIsOperator.DEMO_HTS_OPERATOR_PRIVATE_KEY;
    expect(() => loadProvisioningConfig(supplyIsOperator)).toThrow("must be distinct");
    const supplyIsTreasury = env();
    supplyIsTreasury.DEMO_HTS_SUPPLY_PRIVATE_KEY = supplyIsTreasury.DEMO_HTS_TREASURY_PRIVATE_KEY;
    expect(() => loadProvisioningConfig(supplyIsTreasury)).toThrow("must be distinct");
  });

  it("allows the operator account to also be the treasury", () => {
    const shared = env();
    shared.DEMO_HTS_TREASURY_ACCOUNT_ID = shared.DEMO_HTS_OPERATOR_ACCOUNT_ID;
    shared.DEMO_HTS_TREASURY_PRIVATE_KEY = shared.DEMO_HTS_OPERATOR_PRIVATE_KEY;
    const config = loadProvisioningConfig(shared);
    expect(config.treasuryAccountId).toBe(config.operatorAccountId);
    expect(config.supplyKey.publicKey.toString()).not.toBe(config.operatorKey.publicKey.toString());
  });

  it("requires a complete recipient association and funding request", () => {
    expect(() => loadProvisioningConfig({ ...env(), DEMO_HTS_RECIPIENT_ACCOUNT_ID: "0.0.1003" })).toThrow("configured together");
  });
});

describe("DemoUSD token acceptance checks", () => {
  const config = loadProvisioningConfig(env());

  it("accepts a token that matches the approved DemoUSD shape", () => {
    expect(() => assertDemoToken("0.0.123", demoTokenInfo(config), config)).not.toThrow();
  });

  it("rejects a token whose supply key is the runtime operator key", () => {
    const info = { ...demoTokenInfo(config), supplyKey: config.operatorKey.publicKey };
    expect(() => assertDemoToken("0.0.123", info, config)).toThrow("supply key must not be the runtime operator key");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), supplyKey: null }, config)).toThrow("must have a supply key");
  });

  it("rejects wrong decimals, custom fees, control keys, unlabelled tokens, and foreign treasuries", () => {
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), decimals: 8 }, config)).toThrow("6 decimals");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), customFees: [{}] }, config)).toThrow("custom fees");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), pauseKey: {} }, config)).toThrow("KYC, freeze, pause, or wipe");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), wipeKey: {} }, config)).toThrow("KYC, freeze, pause, or wipe");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), kycKey: {} }, config)).toThrow("KYC, freeze, pause, or wipe");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), freezeKey: {} }, config)).toThrow("KYC, freeze, pause, or wipe");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), tokenMemo: "" }, config)).toThrow("not labelled");
    expect(() => assertDemoToken("0.0.123", { ...demoTokenInfo(config), symbol: "USDC" }, config)).toThrow("not the configured DemoUSD test token");
    const foreignTreasury = { ...demoTokenInfo(config), treasuryAccountId: { toString: () => "0.0.9999" } };
    expect(() => assertDemoToken("0.0.123", foreignTreasury, config)).toThrow("treasury does not match");
  });
});

describe("DemoUSD provisioning state file", () => {
  const state = {
    tokenId: "0.0.123",
    tokenAddress: tokenFacadeAddress("0.0.123"),
    decimals: DEMO_HTS_DECIMALS,
    treasuryAccountId: "0.0.1002",
  } as const;

  it("creates missing directories and round-trips the recorded outputs", async () => {
    expect(await readProvisioningState(statePath)).toBeUndefined();
    await writeProvisioningState(statePath, state);
    expect(await readProvisioningState(statePath)).toEqual(state);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);
  });

  it("writes through a temporary file that is renamed into place", async () => {
    const temporaryPath = `${statePath}.tmp`;
    await writeProvisioningState(statePath, state);
    expect(await Bun.file(temporaryPath).exists()).toBe(false);

    await writeFile(temporaryPath, "{ half-written", "utf8");
    expect(await readProvisioningState(statePath)).toEqual(state);

    const replacement = { ...state, tokenId: "0.0.456", tokenAddress: tokenFacadeAddress("0.0.456") };
    await writeProvisioningState(statePath, replacement);
    expect(await readProvisioningState(statePath)).toEqual(replacement);
    expect(await Bun.file(temporaryPath).exists()).toBe(false);
  });

  it("refuses corrupt or partial state instead of crashing with a parser error", async () => {
    const rejected: unknown[] = [
      "",
      "{",
      '{"tokenId":"0.0.123"',
      "null",
      "[]",
      JSON.stringify({ tokenId: "0.0.0", tokenAddress: state.tokenAddress, decimals: 6, treasuryAccountId: "0.0.1002" }),
      JSON.stringify({ tokenId: "0.0.123", tokenAddress: tokenFacadeAddress("0.0.456"), decimals: 6, treasuryAccountId: "0.0.1002" }),
      JSON.stringify({ tokenId: "0.0.123", tokenAddress: state.tokenAddress, decimals: 8, treasuryAccountId: "0.0.1002" }),
      JSON.stringify({ tokenId: "0.0.123", tokenAddress: state.tokenAddress, decimals: 6 }),
    ];
    for (const content of rejected) {
      await writeProvisioningState(statePath, state);
      await writeFile(statePath, content as string, "utf8");
      const failure = await readProvisioningState(statePath).then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(SyntaxError);
      expect((failure as Error).message).toContain("does not contain a valid DemoUSD token identity");
      expect((failure as Error).message).toContain(statePath);
    }
  });
});

describe("DemoUSD provisioning run", () => {
  it("records token ID, facade address, decimals, and treasury", async () => {
    const config = loadProvisioningConfig(env());
    const { ledger } = ledgerStub(config);
    const { result, output } = await captureConsole(() => provisionDemoHts(config, statePath, ledger));
    expect(result).toEqual({
      tokenId: PROVISIONED_TOKEN_ID,
      tokenAddress: tokenFacadeAddress(PROVISIONED_TOKEN_ID),
      decimals: DEMO_HTS_DECIMALS,
      treasuryAccountId: config.treasuryAccountId,
    });
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(result);
    expect(output).toContain("demo-hts-ready");
    expect(JSON.parse(output.split("\n").at(-1) as string)).toMatchObject({ testToken: true, ...result });
  });

  it("resumes without creating a second token or repeating association", async () => {
    const config = loadProvisioningConfig(envWithRecipient());
    const first = ledgerStub(config);
    const firstRun = await captureConsole(() => provisionDemoHts(config, statePath, first.ledger));
    expect(first.calls.filter((call) => call === "createToken")).toHaveLength(1);

    const second = ledgerStub(config, { alreadyAssociated: true });
    const secondRun = await captureConsole(() => provisionDemoHts(config, statePath, second.ledger));
    expect(second.calls).not.toContain("createToken");
    expect(second.calls.filter((call) => call.startsWith("associateToken"))).toHaveLength(0);
    expect(secondRun.result).toEqual(firstRun.result);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(secondRun.result);
  });

  it("checkpoints the created token before validating it so a failed validation cannot duplicate it", async () => {
    const config = loadProvisioningConfig(env());
    const failing = ledgerStub(config, { failTokenInfo: true });
    await captureConsole(async () => {
      await expect(provisionDemoHts(config, statePath, failing.ledger)).rejects.toThrow("mirror node unavailable");
    });
    expect(failing.calls.filter((call) => call === "createToken")).toHaveLength(1);
    expect(await readProvisioningState(statePath)).toMatchObject({ tokenId: PROVISIONED_TOKEN_ID });

    const retry = ledgerStub(config);
    await captureConsole(() => provisionDemoHts(config, statePath, retry.ledger));
    expect(retry.calls).not.toContain("createToken");
  });

  it("refuses to provision when the saved state is corrupt", async () => {
    const config = loadProvisioningConfig(env());
    await writeProvisioningState(statePath, {
      tokenId: PROVISIONED_TOKEN_ID,
      tokenAddress: tokenFacadeAddress(PROVISIONED_TOKEN_ID),
      decimals: DEMO_HTS_DECIMALS,
      treasuryAccountId: config.treasuryAccountId,
    });
    await writeFile(statePath, "{ truncated", "utf8");
    const { ledger, calls } = ledgerStub(config);
    await captureConsole(async () => {
      await expect(provisionDemoHts(config, statePath, ledger)).rejects.toThrow("does not contain a valid DemoUSD token identity");
    });
    expect(calls).not.toContain("createToken");
  });

  it("refuses a configured token ID that conflicts with the saved state", async () => {
    const config = loadProvisioningConfig(env());
    await writeProvisioningState(statePath, {
      tokenId: PROVISIONED_TOKEN_ID,
      tokenAddress: tokenFacadeAddress(PROVISIONED_TOKEN_ID),
      decimals: DEMO_HTS_DECIMALS,
      treasuryAccountId: config.treasuryAccountId,
    });
    const conflicting = loadProvisioningConfig({ ...envWithRecipient(), DEMO_HTS_TOKEN_ID: "0.0.7777" });
    const { ledger, calls } = ledgerStub(conflicting);
    await captureConsole(async () => {
      await expect(provisionDemoHts(conflicting, statePath, ledger)).rejects.toThrow("conflicts with the saved provisioning state");
    });
    expect(calls).not.toContain("createToken");
  });

  it("associates the recipient before transferring any DemoUSD", async () => {
    const config = loadProvisioningConfig(envWithRecipient());
    const recipient = config.recipient as NonNullable<ProvisioningConfig["recipient"]>;
    const { ledger, calls } = ledgerStub(config);
    await captureConsole(() => provisionDemoHts(config, statePath, ledger));
    const associationIndex = calls.indexOf(`associateToken:${recipient.accountId}:${PROVISIONED_TOKEN_ID}`);
    const transferIndex = calls.findIndex((call) => call.startsWith("transferToken:"));
    expect(associationIndex).toBeGreaterThanOrEqual(0);
    expect(transferIndex).toBeGreaterThanOrEqual(0);
    expect(associationIndex).toBeLessThan(transferIndex);
    expect(calls[transferIndex]).toBe(
      `transferToken:${config.treasuryAccountId}->${recipient.accountId}:${recipient.amount}:${PROVISIONED_TOKEN_ID}`,
    );
  });

  it("moves HBAR nowhere and only reads balances", async () => {
    const config = loadProvisioningConfig(envWithRecipient());
    const { ledger, calls } = ledgerStub(config);
    const { output } = await captureConsole(() => provisionDemoHts(config, statePath, ledger));
    expect(calls).toContain(`hbarTinybars:${config.operatorAccountId}`);
    expect(calls).toContain(`hbarTinybars:${config.treasuryAccountId}`);
    expect(Object.keys(ledger)).not.toContain("transferHbar");
    expect(output).toContain("hbar-balance");
  });

  it("never logs private key material", async () => {
    const values = envWithRecipient();
    const config = loadProvisioningConfig(values);
    const { ledger } = ledgerStub(config);
    const { output } = await captureConsole(() => provisionDemoHts(config, statePath, ledger));
    const secrets = [
      values.DEMO_HTS_OPERATOR_PRIVATE_KEY,
      values.DEMO_HTS_TREASURY_PRIVATE_KEY,
      values.DEMO_HTS_SUPPLY_PRIVATE_KEY,
      values.DEMO_HTS_RECIPIENT_PRIVATE_KEY,
    ];
    for (const secret of secrets) {
      const raw = secret as string;
      expect(output).not.toContain(raw);
      expect(output).not.toContain(PrivateKey.fromString(raw).toStringRaw());
      expect(output).not.toContain(PrivateKey.fromString(raw).toStringDer());
    }
    expect(output.toLowerCase()).not.toContain("private");
    expect(await readFile(statePath, "utf8")).not.toContain("Key");
  });
});
