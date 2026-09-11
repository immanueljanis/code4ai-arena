import {
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenInfoQuery,
  TokenType,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEMO_HTS_DECIMALS = 6;
export const DEMO_HTS_NAME = "DemoUSD Test Token";
export const DEMO_HTS_SYMBOL = "DUSD";
export const DEMO_HTS_MEMO = "TEST token for the code4ai x402 demo. Not Circle USDC. Not redeemable. No value.";
export const DEFAULT_INITIAL_SUPPLY = 1_000_000_000_000n;

export type ProvisioningConfig = {
  operatorAccountId: string;
  operatorKey: PrivateKey;
  treasuryAccountId: string;
  treasuryKey: PrivateKey;
  supplyKey: PrivateKey;
  initialSupply: bigint;
  tokenId?: string;
  recipient?: {
    accountId: string;
    key: PrivateKey;
    amount: bigint;
  };
};

export type ProvisioningState = {
  tokenId: string;
  tokenAddress: `0x${string}`;
  decimals: number;
  treasuryAccountId: string;
};

export type TokenInfo = {
  decimals: number;
  name: string;
  symbol: string;
  tokenMemo: string;
  tokenType: { toString(): string } | null;
  customFees: unknown[];
  kycKey: unknown;
  freezeKey: unknown;
  pauseKey: unknown;
  wipeKey: unknown;
  supplyKey: { toString(): string } | null;
  treasuryAccountId: { toString(): string } | null;
};

export type LedgerClient = {
  hbarTinybars(accountId: string): Promise<string>;
  createToken(config: ProvisioningConfig): Promise<string>;
  tokenInfo(tokenId: string): Promise<TokenInfo>;
  hasTokenAssociation(accountId: string, tokenId: string): Promise<boolean>;
  associateToken(tokenId: string, accountId: string, key: PrivateKey): Promise<void>;
  transferToken(
    tokenId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: bigint,
    signer: PrivateKey,
  ): Promise<void>;
};

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`missing required env var ${key}`);
  return value;
}

export function isHederaId(value: string): boolean {
  return /^0\.0\.[1-9]\d{0,18}$/.test(value) && BigInt(value.slice(4)) <= 9223372036854775807n;
}

export function tokenFacadeAddress(tokenId: string): `0x${string}` {
  if (!isHederaId(tokenId)) throw new Error("token ID must be a 0.0 token ID with a positive signed 64-bit token number");
  return `0x${BigInt(tokenId.slice(4)).toString(16).padStart(40, "0")}`;
}

function parsePositiveAmount(value: string | undefined, key: string, fallback?: bigint): bigint {
  const raw = value ?? fallback?.toString();
  if (!raw || !/^\d+$/.test(raw)) throw new Error(`env var ${key} must be a positive integer in smallest token units`);
  const amount = BigInt(raw);
  if (amount <= 0n) throw new Error(`env var ${key} must be a positive integer in smallest token units`);
  return amount;
}

function parseKey(env: Record<string, string | undefined>, key: string): PrivateKey {
  // ECDSA, not fromString: these accounts are derived from EVM addresses, and
  // fromString defaults to ED25519, which yields a different public key and a
  // transaction the network rejects with INVALID_SIGNATURE.
  try {
    return PrivateKey.fromStringECDSA(required(env, key));
  } catch {
    throw new Error(`env var ${key} is not a valid ECDSA private key`);
  }
}

function parseAccountId(env: Record<string, string | undefined>, key: string): string {
  const value = required(env, key);
  if (!isHederaId(value)) throw new Error(`env var ${key} is not a valid Hedera account ID`);
  return value;
}

function publicKeyIdentity(key: PrivateKey): string {
  return key.publicKey.toString();
}

export function loadProvisioningConfig(env: Record<string, string | undefined>): ProvisioningConfig {
  const operatorKey = parseKey(env, "DEMO_HTS_OPERATOR_PRIVATE_KEY");
  const treasuryKey = parseKey(env, "DEMO_HTS_TREASURY_PRIVATE_KEY");
  const supplyKey = parseKey(env, "DEMO_HTS_SUPPLY_PRIVATE_KEY");
  const supplyIdentity = publicKeyIdentity(supplyKey);
  if (supplyIdentity === publicKeyIdentity(operatorKey) || supplyIdentity === publicKeyIdentity(treasuryKey)) {
    throw new Error("DEMO_HTS supply key must be distinct from the operator and treasury keys");
  }

  const tokenId = env.DEMO_HTS_TOKEN_ID;
  if (tokenId !== undefined && !isHederaId(tokenId)) {
    throw new Error("env var DEMO_HTS_TOKEN_ID is not a valid Hedera token ID");
  }

  const recipientAccountId = env.DEMO_HTS_RECIPIENT_ACCOUNT_ID;
  const recipientKey = env.DEMO_HTS_RECIPIENT_PRIVATE_KEY;
  const recipientAmount = env.DEMO_HTS_RECIPIENT_AMOUNT;
  const recipientConfigured = [recipientAccountId, recipientKey, recipientAmount].some((value) => value !== undefined);
  if (recipientConfigured && (!recipientAccountId || !recipientKey || !recipientAmount)) {
    throw new Error("DEMO_HTS recipient account, key, and amount must be configured together");
  }

  return {
    operatorAccountId: parseAccountId(env, "DEMO_HTS_OPERATOR_ACCOUNT_ID"),
    operatorKey,
    treasuryAccountId: parseAccountId(env, "DEMO_HTS_TREASURY_ACCOUNT_ID"),
    treasuryKey,
    supplyKey,
    initialSupply: parsePositiveAmount(env.DEMO_HTS_INITIAL_SUPPLY, "DEMO_HTS_INITIAL_SUPPLY", DEFAULT_INITIAL_SUPPLY),
    tokenId,
    recipient: recipientConfigured
      ? {
          accountId: parseAccountId(env, "DEMO_HTS_RECIPIENT_ACCOUNT_ID"),
          key: parseKey(env, "DEMO_HTS_RECIPIENT_PRIVATE_KEY"),
          amount: parsePositiveAmount(env.DEMO_HTS_RECIPIENT_AMOUNT, "DEMO_HTS_RECIPIENT_AMOUNT"),
        }
      : undefined,
  };
}

export function buildTokenCreateTransaction(config: ProvisioningConfig): TokenCreateTransaction {
  return new TokenCreateTransaction()
    .setTokenName(DEMO_HTS_NAME)
    .setTokenSymbol(DEMO_HTS_SYMBOL)
    .setTokenMemo(DEMO_HTS_MEMO)
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(DEMO_HTS_DECIMALS)
    .setInitialSupply(config.initialSupply)
    .setTreasuryAccountId(config.treasuryAccountId)
    .setSupplyKey(config.supplyKey.publicKey);
}

export function assertDemoToken(tokenId: string, info: TokenInfo, config: ProvisioningConfig): void {
  if (info.decimals !== DEMO_HTS_DECIMALS) throw new Error(`token ${tokenId} must use ${DEMO_HTS_DECIMALS} decimals`);
  if (info.name !== DEMO_HTS_NAME || info.symbol !== DEMO_HTS_SYMBOL) throw new Error(`token ${tokenId} is not the configured DemoUSD test token`);
  if (info.tokenMemo !== DEMO_HTS_MEMO) throw new Error(`token ${tokenId} is not labelled as the DemoUSD test token`);
  if (info.tokenType?.toString() !== TokenType.FungibleCommon.toString()) throw new Error(`token ${tokenId} must be fungible`);
  if (info.customFees.length !== 0) throw new Error(`token ${tokenId} must not have custom fees`);
  if (info.kycKey || info.freezeKey || info.pauseKey || info.wipeKey) throw new Error(`token ${tokenId} must not enable KYC, freeze, pause, or wipe controls`);
  if (!info.supplyKey) throw new Error(`token ${tokenId} must have a supply key`);
  if (info.supplyKey.toString() === publicKeyIdentity(config.operatorKey)) {
    throw new Error(`token ${tokenId} supply key must not be the runtime operator key`);
  }
  if (info.treasuryAccountId?.toString() !== config.treasuryAccountId) throw new Error(`token ${tokenId} treasury does not match DEMO_HTS_TREASURY_ACCOUNT_ID`);
}

function parseProvisioningState(raw: string): ProvisioningState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const state = parsed as Partial<ProvisioningState>;
  if (typeof state.tokenId !== "string" || !isHederaId(state.tokenId)) return undefined;
  if (state.tokenAddress !== tokenFacadeAddress(state.tokenId)) return undefined;
  if (state.decimals !== DEMO_HTS_DECIMALS) return undefined;
  if (typeof state.treasuryAccountId !== "string" || !isHederaId(state.treasuryAccountId)) return undefined;
  return {
    tokenId: state.tokenId,
    tokenAddress: state.tokenAddress,
    decimals: state.decimals,
    treasuryAccountId: state.treasuryAccountId,
  };
}

export async function readProvisioningState(statePath: string): Promise<ProvisioningState | undefined> {
  let raw: string;
  try {
    raw = await readFile(statePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const state = parseProvisioningState(raw);
  if (!state) {
    throw new Error(
      `provisioning state at ${statePath} does not contain a valid DemoUSD token identity; inspect it and remove it only after confirming no token was created`,
    );
  }
  return state;
}

export async function writeProvisioningState(statePath: string, state: ProvisioningState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, statePath);
}

export const MIRROR_NODE_URL =
  process.env.HEDERA_MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";

export async function mirrorHbarTinybars(accountId: string): Promise<string> {
  const response = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${accountId}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`mirror node returned ${response.status} for ${accountId}`);
  const body = (await response.json()) as { balance?: { balance?: number } };
  return String(body.balance?.balance ?? 0);
}

function testnetLedger(config: ProvisioningConfig): LedgerClient {
  const client = Client.forTestnet().setOperator(config.operatorAccountId, config.operatorKey);
  return {
    async hbarTinybars(accountId) {
      // Mirror node REST rather than AccountBalanceQuery: the SDK query has
      // hung indefinitely here, and a balance report must never stall a
      // sequence that is about to spend.
      return mirrorHbarTinybars(accountId);
    },
    async createToken(tokenConfig) {
      const signedTransaction = await buildTokenCreateTransaction(tokenConfig)
        .freezeWith(client)
        .sign(tokenConfig.treasuryKey);
      const receipt = await (await signedTransaction.execute(client)).getReceipt(client);
      if (!receipt.tokenId) throw new Error("token creation receipt did not include a token ID");
      return receipt.tokenId.toString();
    },
    async tokenInfo(tokenId) {
      return (await new TokenInfoQuery().setTokenId(tokenId).execute(client)) as unknown as TokenInfo;
    },
    async hasTokenAssociation(accountId, tokenId) {
      const response = await fetch(
        `${MIRROR_NODE_URL}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`,
        { signal: AbortSignal.timeout(20_000) }
      );
      if (!response.ok) throw new Error(`mirror node returned ${response.status} for ${accountId}`);
      const body = (await response.json()) as { tokens?: unknown[] };
      return (body.tokens ?? []).length > 0;
    },
    async associateToken(tokenId, accountId, key) {
      const transaction = await new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(key);
      await (await transaction.execute(client)).getReceipt(client);
    },
    async transferToken(tokenId, fromAccountId, toAccountId, amount, signer) {
      const transaction = await new TransferTransaction()
        .addTokenTransferWithDecimals(tokenId, fromAccountId, -amount, DEMO_HTS_DECIMALS)
        .addTokenTransferWithDecimals(tokenId, toAccountId, amount, DEMO_HTS_DECIMALS)
        .freezeWith(client)
        .sign(signer);
      await (await transaction.execute(client)).getReceipt(client);
    },
  };
}

async function reportHbarBalance(ledger: LedgerClient, accountId: string, label: string): Promise<void> {
  console.log(JSON.stringify({ event: "hbar-balance", accountId, label, tinybars: await ledger.hbarTinybars(accountId) }));
}

async function fundRecipient(ledger: LedgerClient, tokenId: string, config: ProvisioningConfig): Promise<void> {
  const recipient = config.recipient;
  if (!recipient) return;
  if (!(await ledger.hasTokenAssociation(recipient.accountId, tokenId))) {
    await ledger.associateToken(tokenId, recipient.accountId, recipient.key);
  }
  await ledger.transferToken(tokenId, config.treasuryAccountId, recipient.accountId, recipient.amount, config.treasuryKey);
}

export async function provisionDemoHts(
  config: ProvisioningConfig,
  statePath: string,
  ledger: LedgerClient = testnetLedger(config),
): Promise<ProvisioningState> {
  await reportHbarBalance(ledger, config.operatorAccountId, "operator");
  if (config.treasuryAccountId !== config.operatorAccountId) {
    await reportHbarBalance(ledger, config.treasuryAccountId, "treasury");
  }

  const savedState = await readProvisioningState(statePath);
  if (savedState && config.tokenId && savedState.tokenId !== config.tokenId) {
    throw new Error("DEMO_HTS_TOKEN_ID conflicts with the saved provisioning state");
  }
  const tokenId = config.tokenId ?? savedState?.tokenId ?? (await ledger.createToken(config));
  const nextState: ProvisioningState = {
    tokenId,
    tokenAddress: tokenFacadeAddress(tokenId),
    decimals: DEMO_HTS_DECIMALS,
    treasuryAccountId: config.treasuryAccountId,
  };
  await writeProvisioningState(statePath, nextState);
  assertDemoToken(tokenId, await ledger.tokenInfo(tokenId), config);
  await fundRecipient(ledger, tokenId, config);
  console.log(JSON.stringify({ event: "demo-hts-ready", profile: "demo-hts", symbol: DEMO_HTS_SYMBOL, testToken: true, ...nextState }));
  return nextState;
}

async function main(): Promise<void> {
  const statePath = process.env.DEMO_HTS_STATE_PATH ?? path.resolve(process.cwd(), ".demo-hts-provisioning.json");
  await provisionDemoHts(loadProvisioningConfig(process.env), statePath);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "DemoUSD provisioning failed");
    process.exitCode = 1;
  });
}
