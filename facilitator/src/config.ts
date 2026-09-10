import type { ArenaTransferPolicy } from "./types.ts";

export interface FacilitatorConfig {
  port: number;
  network: "hedera:testnet";
  feePayerAccountId: string;
  feePayerPrivateKey: string;
  settlementSecret: string;
  databaseUrl: string;
  mirrorNodeUrl?: string;
  policy: ArenaTransferPolicy;
}

const HEDERA_ID = /^\d+\.\d+\.\d+$/;

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`missing required env var ${key}`);
  return value;
}

function requiredId(env: Record<string, string | undefined>, key: string): string {
  const value = required(env, key);
  if (!HEDERA_ID.test(value)) throw new Error(`env var ${key} is not a valid Hedera account ID: ${key}`);
  return value;
}

function positiveInteger(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`env var ${key} must be a positive integer`);
  return value;
}

export function loadFacilitatorConfig(env: Record<string, string | undefined>): FacilitatorConfig {
  const network = env.HEDERA_NETWORK?.trim() ?? "hedera:testnet";
  if (network !== "hedera:testnet") {
    throw new Error("env var HEDERA_NETWORK must be hedera:testnet");
  }

  const nodeAccountIds = (env.FACILITATOR_ALLOWED_NODE_ACCOUNT_IDS ?? "0.0.3,0.0.4,0.0.5,0.0.6,0.0.7,0.0.8,0.0.9")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!nodeAccountIds.length || nodeAccountIds.some((id) => !HEDERA_ID.test(id))) {
    throw new Error("env var FACILITATOR_ALLOWED_NODE_ACCOUNT_IDS must be a comma separated list of Hedera account IDs");
  }

  const stakeAmount = required(env, "FACILITATOR_STAKE_AMOUNT");
  if (!/^[1-9]\d*$/.test(stakeAmount)) {
    throw new Error("env var FACILITATOR_STAKE_AMOUNT must be a positive integer in the token's smallest unit");
  }

  const feePayerAccountId = requiredId(env, "FACILITATOR_ACCOUNT_ID");

  return {
    port: positiveInteger(env, "PORT", 4020),
    network,
    feePayerAccountId,
    feePayerPrivateKey: required(env, "FACILITATOR_PRIVATE_KEY"),
    settlementSecret: required(env, "X402_SETTLEMENT_SECRET"),
    databaseUrl: required(env, "DATABASE_URL"),
    mirrorNodeUrl: env.HEDERA_MIRROR_NODE_URL?.trim() || undefined,
    policy: {
      network,
      tokenId: requiredId(env, "FACILITATOR_TOKEN_ID"),
      arenaAccountId: requiredId(env, "HEDERA_ARENA_ACCOUNT_ID"),
      feePayerAccountId,
      stakeAmount,
      maxTimeoutSeconds: positiveInteger(env, "FACILITATOR_MAX_TIMEOUT_SECONDS", 300),
      allowedNodeAccountIds: nodeAccountIds,
      maxTransactionFeeTinybar: env.FACILITATOR_MAX_FEE_TINYBAR?.trim() || "200000000",
      minTransactionValidDurationSeconds: positiveInteger(env, "FACILITATOR_MIN_DURATION_SECONDS", 30),
      maxTransactionValidDurationSeconds: positiveInteger(env, "FACILITATOR_MAX_DURATION_SECONDS", 180),
      minRemainingLifetimeSeconds: positiveInteger(env, "FACILITATOR_MIN_REMAINING_SECONDS", 10),
      maxFutureStartSeconds: positiveInteger(env, "FACILITATOR_MAX_FUTURE_START_SECONDS", 15),
    },
  };
}
