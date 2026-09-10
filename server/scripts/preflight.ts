import { createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, serverConfig } from "../src/config.ts";

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreflightProbes {
  chainId(): Promise<number>;
  gasBalanceWei(address: Address): Promise<bigint>;
  bytecodeSize(address: Address): Promise<number>;
  tokenDecimals(tokenId: string): Promise<number | undefined>;
  facilitatorHealthy(url: string): Promise<boolean>;
}

export const MIN_GAS_HBAR = 2;
const WEI_PER_HBAR = 10n ** 18n;

export function livePreflightProbes(): PreflightProbes {
  const client = createPublicClient({
    transport: http(serverConfig.rpcUrl, { retryCount: 3, retryDelay: 1000 }),
  });
  const mirror = process.env.HEDERA_MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";
  return {
    chainId: () => client.getChainId(),
    gasBalanceWei: (address) => client.getBalance({ address }),
    bytecodeSize: async (address) => ((await client.getCode({ address })) ?? "0x").length / 2 - 1,
    tokenDecimals: async (tokenId) => {
      const response = await fetch(`${mirror}/api/v1/tokens/${tokenId}`);
      if (!response.ok) return undefined;
      const body = (await response.json()) as { decimals?: string | number };
      return body.decimals === undefined ? undefined : Number(body.decimals);
    },
    facilitatorHealthy: async (url) => {
      try {
        const response = await fetch(`${url}/health`);
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Everything that must hold before a run is allowed to spend gas or create
 * on-chain state. Fails closed: an unreachable probe is a failed check, never
 * a silent pass.
 */
export async function runPreflight(probes: PreflightProbes): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  const record = async (name: string, run: () => Promise<PreflightCheck>) => {
    try {
      checks.push(await run());
    } catch (error) {
      checks.push({ name, ok: false, detail: (error as Error).message });
    }
  };

  await record("chain-id", async () => {
    const chainId = await probes.chainId();
    return {
      name: "chain-id",
      ok: chainId === CHAIN_ID,
      detail: `rpc reports ${chainId}, expected ${CHAIN_ID}`,
    };
  });

  const operator = privateKeyToAccount(serverConfig.verifierKey).address;
  await record("gas-budget", async () => {
    const balance = await probes.gasBalanceWei(operator);
    const hbar = Number((balance * 1000n) / WEI_PER_HBAR) / 1000;
    return {
      name: "gas-budget",
      ok: balance >= BigInt(MIN_GAS_HBAR) * WEI_PER_HBAR,
      detail: `${operator} holds ${hbar} HBAR, need at least ${MIN_GAS_HBAR}`,
    };
  });

  await record("settlement-token", async () => {
    const decimals = await probes.tokenDecimals(serverConfig.settlementTokenId);
    return {
      name: "settlement-token",
      ok: decimals === serverConfig.settlementDecimals,
      detail: `${serverConfig.settlementProfile} token ${serverConfig.settlementTokenId} (${serverConfig.settlementSymbol}) reports decimals ${decimals}`,
    };
  });

  await record("arena-deployed", async () => {
    const size = await probes.bytecodeSize(serverConfig.arenaAddress);
    return {
      name: "arena-deployed",
      ok: size > 0,
      detail: `${serverConfig.arenaAddress} has ${size} bytes of code`,
    };
  });

  await record("facilitator", async () => {
    const healthy = await probes.facilitatorHealthy(serverConfig.x402FacilitatorUrl);
    return {
      name: "facilitator",
      ok: healthy,
      detail: `${serverConfig.x402FacilitatorUrl} health ${healthy ? "ok" : "unreachable"}`,
    };
  });

  return checks;
}

if (import.meta.main) {
  const checks = await runPreflight(livePreflightProbes());
  for (const check of checks) {
    console.log(JSON.stringify({ event: "preflight", ...check }));
  }
  const failed = checks.filter((check) => !check.ok);
  console.log(
    JSON.stringify({
      event: "preflight-summary",
      profile: serverConfig.settlementProfile,
      symbol: serverConfig.settlementSymbol,
      passed: checks.length - failed.length,
      failed: failed.length,
    })
  );
  if (failed.length) process.exit(1);
}
