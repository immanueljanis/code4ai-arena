import { readFileSync } from "node:fs";
import path from "node:path";
import { keccak256, toBytes } from "viem";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "./config.ts";

export interface ArenaClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
}

const hederaTestnet = (): Chain => ({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [serverConfig.rpcUrl] } },
  testnet: true,
});

function loadArenaAbi(): unknown[] {
  const outDir = process.env.CONTRACTS_OUT_DIR ?? path.join("..", "contracts", "out");
  const raw = JSON.parse(
    readFileSync(path.join(outDir, "Arena.sol", "Arena.json"), "utf8")
  ) as { abi: unknown[] };
  return raw.abi;
}

function arenaClients(): ArenaClients {
  const account = privateKeyToAccount(serverConfig.verifierKey);
  // retryCount/retryDelay: public RPC relays rate-limit eth_call (~15-25 rps);
  // retrying with backoff keeps pool reads (and slash/payout reads) reliable.
  const transport = http(serverConfig.rpcUrl, { retryCount: 5, retryDelay: 1000 });
  return {
    publicClient: createPublicClient({ chain: hederaTestnet(), transport }),
    walletClient: createWalletClient({ chain: hederaTestnet(), transport, account }),
  };
}

const keyHash = (s: string) => keccak256(toBytes(s));

/** INVALID verdict: fold the settled stake into the pool. Returns tx hash. */
export async function slash(
  targetKey: string,
  agent: string,
  stakeAmount: bigint,
  clients: ArenaClients = arenaClients()
): Promise<string> {
  return (await clients.walletClient.writeContract({
    address: serverConfig.arenaAddress,
    abi: loadArenaAbi(),
    functionName: "slash",
    args: [keyHash(targetKey), agent as Address, stakeAmount],
  })) as string;
}

/** VALID verdict: pay stake + bounty to the agent, deduct bounty from pool. Returns tx hash. */
export async function payout(
  targetKey: string,
  invariantId: string,
  agent: string,
  stakeAmount: bigint,
  bountyAmount: bigint,
  clients: ArenaClients = arenaClients()
): Promise<string> {
  return (await clients.walletClient.writeContract({
    address: serverConfig.arenaAddress,
    abi: loadArenaAbi(),
    functionName: "payout",
    args: [
      keyHash(targetKey),
      keyHash(invariantId),
      agent as Address,
      stakeAmount,
      bountyAmount,
    ],
  })) as string;
}

/**
 * Live pool remaining for a target (Arena.targets(key).pool).
 * Cached briefly: pools only change on payout/slash, and public RPC relays
 * rate-limit eth_call (~15-25 rps) — caching keeps read-heavy endpoints
 * (contests list, state feed) well under the limit.
 */
const POOL_CACHE_TTL_MS = 3_000;
const poolCache = new Map<string, { at: number; value: bigint }>();

/** Retry RPC rate-limit errors (public relays cap requests per second). */
async function readPoolWithRetry(
  clients: ArenaClients,
  targetKey: string,
  attempts = 5
): Promise<bigint> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = (await clients.publicClient.readContract({
        address: serverConfig.arenaAddress,
        abi: loadArenaAbi(),
        functionName: "targets",
        args: [keyHash(targetKey)],
      })) as [bigint, boolean];
      return result[0];
    } catch (e) {
      lastError = e;
      const msg = String(e instanceof Error ? e.message : e);
      if (msg.includes("limited") || msg.includes("rate")) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1))); // backoff
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export async function getPool(
  targetKey: string,
  clients: ArenaClients = arenaClients()
): Promise<bigint> {
  const cached = poolCache.get(targetKey);
  if (cached && Date.now() - cached.at < POOL_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = await readPoolWithRetry(clients, targetKey);
  poolCache.set(targetKey, { at: Date.now(), value });
  return value;
}

/** Invalidate the cached pool (called after slash/payout so reads are fresh). */
export function invalidatePool(targetKey: string): void {
  poolCache.delete(targetKey);
}

/** Whether an invariant has already been claimed on-chain (Arena.claimed). */
export async function isClaimed(
  targetKey: string,
  invariantId: string,
  clients: ArenaClients = arenaClients()
): Promise<boolean> {
  return (await clients.publicClient.readContract({
    address: serverConfig.arenaAddress,
    abi: loadArenaAbi(),
    functionName: "claimed",
    args: [claimKey(targetKey, invariantId)],
  })) as boolean;
}

/** The exact claim key Arena uses: keccak256(abi.encodePacked(keyHash, invariantHash)). */
export function claimKey(targetKey: string, invariantId: string): `0x${string}` {
  const a = keyHash(targetKey);
  const b = keyHash(invariantId);
  return keccak256(new Uint8Array([...toBytes(a), ...toBytes(b)]));
}
