import { isAddress } from "viem";

export const CHAIN_ID = 296;

export interface ServerConfig {
  chainId: number;
  rpcUrl: string;
  usdcAddress: `0x${string}`;
  arenaAddress: `0x${string}`;
  vaultAddresses: {
    accessControl: `0x${string}`;
    rounding: `0x${string}`;
    timeWindow: `0x${string}`;
  };
  verifierKey: `0x${string}`;
  serverWalletSecret: string;
  x402FacilitatorUrl: string;
  erc8004MainnetKey?: string;
}

function requiredAddr(env: Record<string, string | undefined>, key: string): `0x${string}` {
  const raw = env[key];
  if (!raw) throw new Error(`missing required env var ${key}`);
  if (!isAddress(raw)) throw new Error(`env var ${key} is not a valid address: ${raw}`);
  return raw as `0x${string}`;
}

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const required = [
    "HEDERA_TESTNET_RPC_URL",
    "HEDERA_USDC_TESTNET_ADDRESS",
    "ARENA_ADDRESS",
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
    usdcAddress: requiredAddr(env, "HEDERA_USDC_TESTNET_ADDRESS"),
    arenaAddress: requiredAddr(env, "ARENA_ADDRESS"),
    vaultAddresses: {
      accessControl: requiredAddr(env, "ACCESS_CONTROL_VAULT_ADDRESS"),
      rounding: requiredAddr(env, "ROUNDING_VAULT_ADDRESS"),
      timeWindow: requiredAddr(env, "TIME_WINDOW_VAULT_ADDRESS"),
    },
    verifierKey: verifierKey as `0x${string}`,
    serverWalletSecret: env.SERVER_WALLET_SECRET as string,
    x402FacilitatorUrl:
      env.X402_FACILITATOR_URL ?? "https://facilitator.blockydevs.com",
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
