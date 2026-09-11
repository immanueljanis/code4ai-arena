import { readFileSync } from "node:fs";
import path from "node:path";
import { keccak256, parseEventLogs, toBytes } from "viem";
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

const RECEIPT_TIMEOUT_MS = 120_000;

export const attemptKey = (attemptId: string): `0x${string}` => keyHash(attemptId);

/** Whether an attempt has already been settled on-chain (Arena.settledAttempts). */
export async function isAttemptSettled(
  attemptId: string,
  clients: ArenaClients = arenaClients()
): Promise<boolean> {
  return (await clients.publicClient.readContract({
    address: serverConfig.arenaAddress,
    abi: loadArenaAbi(),
    functionName: "settledAttempts",
    args: [attemptKey(attemptId)],
  })) as boolean;
}

const normalize = (value: unknown): string =>
  typeof value === "string" ? value.toLowerCase() : String(value);

/**
 * Broadcast an Arena settlement call, wait for a successful receipt, and confirm
 * the emitted event matches every argument we sent. A missing event is only
 * accepted when the attempt is already recorded on-chain (idempotent replay);
 * an unconfirmed broadcast throws with the tx hash attached so callers can
 * reconcile instead of re-paying.
 */
async function settleOnce(
  clients: ArenaClients,
  attemptId: string,
  functionName: "slash" | "payout",
  eventName: "Slashed" | "Paid",
  args: readonly unknown[]
): Promise<string> {
  const abi = loadArenaAbi();
  const hash = (await clients.walletClient.writeContract({
    address: serverConfig.arenaAddress,
    abi,
    functionName,
    args,
  })) as `0x${string}`;

  const receipt = await clients.publicClient.waitForTransactionReceipt({
    hash,
    timeout: RECEIPT_TIMEOUT_MS,
  });
  if (receipt.status !== "success") {
    throw Object.assign(new Error(`Arena.${functionName} reverted`), {
      txHash: hash,
      settlementConfirmed: false,
    });
  }

  const events = parseEventLogs({ abi, eventName, logs: receipt.logs }) as Array<{
    args: Record<string, unknown>;
  }>;
  const expected = args.map(normalize);
  const matched = events.some((event) => {
    const actual = Object.values(event.args).map(normalize);
    return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  });
  if (!matched && !(await isAttemptSettled(attemptId, clients))) {
    throw Object.assign(new Error(`Arena.${functionName} did not settle the attempt`), {
      txHash: hash,
      settlementConfirmed: false,
    });
  }
  return hash;
}

/** INVALID verdict: fold the settled stake into the pool. Returns a confirmed tx hash. */
export async function slash(
  targetKey: string,
  agent: string,
  stakeAmount: bigint,
  attemptId: string,
  clients: ArenaClients = arenaClients()
): Promise<string> {
  return settleOnce(clients, attemptId, "slash", "Slashed", [
    keyHash(targetKey),
    agent as Address,
    stakeAmount,
    attemptKey(attemptId),
  ]);
}

/** VALID verdict: pay stake + bounty to the agent from the pool. Returns a confirmed tx hash. */
export async function payout(
  targetKey: string,
  invariantId: string,
  agent: string,
  stakeAmount: bigint,
  bountyAmount: bigint,
  attemptId: string,
  clients: ArenaClients = arenaClients()
): Promise<string> {
  return settleOnce(clients, attemptId, "payout", "Paid", [
    keyHash(targetKey),
    keyHash(invariantId),
    agent as Address,
    stakeAmount,
    bountyAmount,
    attemptKey(attemptId),
  ]);
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
  try {
    const value = await readPoolWithRetry(clients, targetKey);
    poolCache.set(targetKey, { at: Date.now(), value });
    return value;
  } catch (e) {
    // A stale pool is closer to the truth than a failed feed: the spectator
    // view polls every few seconds and one bad RPC read must not blank it.
    if (cached) return cached.value;
    throw e;
  }
}

/**
 * The pool, or null when it has never been read successfully. Callers rendering
 * a feed use this so one unreadable target degrades to "unknown" instead of
 * failing the whole response or, worse, reporting an empty pool.
 */
export async function getPoolOrNull(
  targetKey: string,
  clients: ArenaClients = arenaClients()
): Promise<bigint | null> {
  try {
    return await getPool(targetKey, clients);
  } catch {
    return null;
  }
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
