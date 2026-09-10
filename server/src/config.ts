import { isAddress } from "viem";

export const CHAIN_ID = 296;

export interface ServerConfig {
  chainId: number;
  rpcUrl: string;
  settlementProfile: "usdc" | "demo-hts";
  settlementSymbol: "USDC" | "DemoUSD";
  settlementTokenId: string;
  settlementTokenAddress: `0x${string}`;
  settlementDecimals: 6;
  usdcAddress: `0x${string}`;
  hederaUsdcTokenId: string;
  arenaAddress: `0x${string}`;
  hederaArenaAccountId: string;
  vaultAddresses: {
    accessControl: `0x${string}`;
    rounding: `0x${string}`;
    timeWindow: `0x${string}`;
  };
  verifierKey: `0x${string}`;
  serverWalletSecret: string;
  x402FacilitatorUrl: string;
  hederaFacilitatorAccountId: string;
  erc8004MainnetKey?: string;
}

function requiredAddr(env: Record<string, string | undefined>, key: string): `0x${string}` {
  const raw = env[key];
  if (!raw) throw new Error(`missing required env var ${key}`);
  if (!isAddress(raw)) throw new Error(`env var ${key} is not a valid address: ${raw}`);
  return raw as `0x${string}`;
}

function requiredHederaId(env: Record<string, string | undefined>, key: string, fallback?: string): string {
  const raw = env[key] ?? fallback;
  if (!raw) throw new Error(`missing required env var ${key}`);
  if (!/^\d+\.\d+\.\d+$/.test(raw)) {
    throw new Error(`env var ${key} is not a valid Hedera entity ID: ${raw}`);
  }
  return raw;
}

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const settlementProfile = env.SETTLEMENT_PROFILE ?? "usdc";
  if (settlementProfile !== "usdc" && settlementProfile !== "demo-hts") {
    throw new Error("env var SETTLEMENT_PROFILE must be usdc or demo-hts");
  }

  let settlementTokenId: string;
  let settlementTokenAddress: `0x${string}`;
  if (settlementProfile === "demo-hts") {
    for (const key of ["X402_FACILITATOR_URL", "X402_FACILITATOR_ACCOUNT_ID"] as const) {
      if (!env[key]?.trim()) throw new Error(`missing required env var ${key} for demo-hts`);
    }
    try {
      const url = new URL(env.X402_FACILITATOR_URL as string);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("env var X402_FACILITATOR_URL must be a valid http or https URL");
    }
    const id = env.DEMO_HTS_TOKEN_ID;
    if (!id) throw new Error("missing required env var DEMO_HTS_TOKEN_ID");
    if (!/^0\.0\.[1-9]\d{0,18}(?![\s\S])/.test(id) || BigInt(id.slice(4)) > 9223372036854775807n) {
      throw new Error("env var DEMO_HTS_TOKEN_ID must be a 0.0 token ID with a positive signed 64-bit token number");
    }
    if (env.DEMO_HTS_TOKEN_DECIMALS !== undefined && env.DEMO_HTS_TOKEN_DECIMALS !== "6") {
      throw new Error("env var DEMO_HTS_TOKEN_DECIMALS must be 6");
    }
    settlementTokenId = id;
    settlementTokenAddress = `0x${BigInt(id.slice(4)).toString(16).padStart(40, "0")}`;
    if (env.DEMO_HTS_TOKEN_ADDRESS &&
        env.DEMO_HTS_TOKEN_ADDRESS.toLowerCase() !== settlementTokenAddress) {
      throw new Error("env var DEMO_HTS_TOKEN_ADDRESS must match DEMO_HTS_TOKEN_ID");
    }
  } else {
    settlementTokenAddress = requiredAddr(env, "HEDERA_USDC_TESTNET_ADDRESS");
    settlementTokenId = requiredHederaId(env, "HEDERA_USDC_TESTNET_ID", "0.0.429274");
  }

  const required = [
    "HEDERA_TESTNET_RPC_URL",
    "ARENA_ADDRESS",
    "HEDERA_ARENA_ACCOUNT_ID",
    "ACCESS_CONTROL_VAULT_ADDRESS",
    "ROUNDING_VAULT_ADDRESS",
    "TIME_WINDOW_VAULT_ADDRESS",
    "VERIFIER_KEY",
    "SERVER_WALLET_SECRET",
  ] as const;
  for (const key of required) {
    if (!env[key]) throw new Error(`missing required env var ${key}`);
  }

  const verifierKey = env.VERIFIER_KEY as string;
  if (!/^0x[0-9a-fA-F]{64}$/.test(verifierKey)) {
    throw new Error(`env var VERIFIER_KEY is not a valid private key`);
  }

  return {
    chainId: CHAIN_ID,
    rpcUrl: env.HEDERA_TESTNET_RPC_URL as string,
    settlementProfile,
    settlementSymbol: settlementProfile === "usdc" ? "USDC" : "DemoUSD",
    settlementTokenId,
    settlementTokenAddress,
    settlementDecimals: 6,
    usdcAddress: settlementTokenAddress,
    hederaUsdcTokenId: settlementTokenId,
    arenaAddress: requiredAddr(env, "ARENA_ADDRESS"),
    hederaArenaAccountId: requiredHederaId(env, "HEDERA_ARENA_ACCOUNT_ID"),
    vaultAddresses: {
      accessControl: requiredAddr(env, "ACCESS_CONTROL_VAULT_ADDRESS"),
      rounding: requiredAddr(env, "ROUNDING_VAULT_ADDRESS"),
      timeWindow: requiredAddr(env, "TIME_WINDOW_VAULT_ADDRESS"),
    },
    verifierKey: verifierKey as `0x${string}`,
    serverWalletSecret: env.SERVER_WALLET_SECRET as string,
    x402FacilitatorUrl:
      env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
    hederaFacilitatorAccountId: requiredHederaId(
      env,
      "X402_FACILITATOR_ACCOUNT_ID",
      "0.0.7162784"
    ),
    erc8004MainnetKey: env.ERC8004_MAINNET_KEY || undefined,
  };
}

let _serverConfig: ServerConfig | undefined;

export const serverConfig: ServerConfig = new Proxy({} as ServerConfig, {
  get(_target, prop) {
    if (!_serverConfig) _serverConfig = loadConfig(process.env);
    return Reflect.get(_serverConfig, prop);
  },
});
