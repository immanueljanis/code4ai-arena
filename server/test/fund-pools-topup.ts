import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import path from "node:path";

// Run from server/ — Bun auto-loads server/.env (VERIFIER_KEY).
const RPC = "https://testnet.hashio.io/api";
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const ARENA = "0xb8c3e39305bdb70eb9a0c7ae848eecbfbf5293d5";

const chain = { id: 296, name: "Hedera Testnet", nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, testnet: true } as const;
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const account = privateKeyToAccount(process.env.VERIFIER_KEY as `0x${string}`);
const wallet = createWalletClient({ chain, transport: http(RPC), account });

const arenaAbi = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "..", "contracts", "out", "Arena.sol", "Arena.json"), "utf8"),
).abi;
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

// Top up the thin pools: each VALID costs stake(1) + bounty(1) = 2 USDC.
const TOPUPS: Array<[string, bigint]> = [
  ["access-control-vault", 6_000_000n], // +6 → 3x VALID
  ["rounding-vault", 6_000_000n],       // +6 → 3x VALID
  ["time-window-vault", 6_000_000n],    // +6 → 3x VALID
];
const total = TOPUPS.reduce((s, [, a]) => s + a, 0n);

const deployer = account.address;
const bal = (await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer] })) as bigint;
console.log("verifier USDC:", (bal / 1_000_000n).toString(), "needed:", (total / 1_000_000n).toString());
if (bal < total) {
  console.log("INSUFFICIENT — aborting");
  process.exit(1);
}

const approveTx = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [ARENA, total] });
console.log("approve:", approveTx);
await publicClient.waitForTransactionReceipt({ hash: approveTx });

for (const [key, amount] of TOPUPS) {
  const targetKey = keccak256(toBytes(key));
  const tx = await wallet.writeContract({ address: ARENA, abi: arenaAbi, functionName: "fundPool", args: [targetKey, amount] });
  console.log(`fundPool ${key} +${(amount / 1_000_000n).toString()} USDC:`, tx);
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

for (const [key] of TOPUPS) {
  const pool = (await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "targets", args: [keccak256(toBytes(key))] })) as [bigint, boolean];
  console.log(`${key} pool now: ${(pool[0] / 1_000_000n).toString()} USDC`);
}
const remaining = (await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer] })) as bigint;
console.log(`verifier keeps: ${(remaining / 1_000_000n).toString()} USDC (agent funding)`);
process.exit(0);
