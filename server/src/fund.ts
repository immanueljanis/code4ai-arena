import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "./config.ts";

/** Minimal ERC20 ABI — USDC on Hedera is an HTS token via its ERC-20 facade (no EIP-3009). */
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const hederaTestnet = (): Chain => ({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [serverConfig.rpcUrl] } },
  testnet: true,
});

/** Poll until the agent holds at least `minAtomic` USDC (relay/consensus lag). */
async function waitForBalance(
  publicClient: ReturnType<typeof createPublicClient>,
  agent: Address,
  minAtomic: bigint,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const bal = (await publicClient.readContract({
      address: serverConfig.usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [agent],
    })) as bigint;
    if (bal >= minAtomic) return;
    await new Promise((r) => setTimeout(r, 1500)); // stay under RPC rate limits
  }
  throw new Error(`agent ${agent} did not reach ${minAtomic} USDC in time`);
}

/**
 * Top the agent wallet up with USDC so it can stake. The verifier (deployer)
 * holds testnet USDC; in custody mode the server funds the stake on the
 * agent's behalf. Funds exactly the stake: a VALID attempt never moves the
 * stake (auth discarded) and INVALID settles exactly 1 USDC, so no margin is
 * needed. Returns the funding tx hash (or null if already funded).
 */
export async function ensureAgentUsdc(
  agentAddress: Address,
  minAtomic: bigint = 1_000_000n, // 1 USDC stake
): Promise<string | null> {
  const account = privateKeyToAccount(serverConfig.verifierKey);
  const transport = http(serverConfig.rpcUrl);
  const publicClient = createPublicClient({ chain: hederaTestnet(), transport });
  const walletClient = createWalletClient({ chain: hederaTestnet(), transport, account });

  const bal = (await publicClient.readContract({
    address: serverConfig.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [agentAddress],
  })) as bigint;
  if (bal >= minAtomic) return null;

  const topUp = minAtomic; // exactly the stake — no margin needed
  const tx = await walletClient.writeContract({
    address: serverConfig.usdcAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [agentAddress, topUp],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  await new Promise((r) => setTimeout(r, 1000)); // consensus lag before polling
  await waitForBalance(publicClient, agentAddress, minAtomic);
  return tx;
}
