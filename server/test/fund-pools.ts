import { createPublicClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import path from "node:path";

const RPC = "https://testnet.hashio.io/api";
const USDC = "0x0000000000000000000000000000000000068cda";
const ARENA = "0x5928df319b3D062203D6aF33A6797df4a96b18a4";

const chain = { id: 296, name: "Hedera Testnet", nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, testnet: true } as const;
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const account = privateKeyToAccount(process.env.TESTNET_VERIFIER_KEY as `0x${string}`);
const wallet = createWalletClient({ chain, transport: http(RPC), account });

const arenaAbi = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "..", "contracts", "out", "Arena.sol", "Arena.json"), "utf8"),
).abi;
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

// per-target funding: enough for 1 payout (stake 1 + bounty) with margin
const FUNDS: Array<[string, bigint]> = [
  ["rounding-vault", 16_000_000n], // bounty 15 + stake 1
  ["time-window-vault", 11_000_000n], // bounty 10 + stake 1
];
const total = FUNDS.reduce((s, [, a]) => s + a, 0n);

const deployer = account.address;
const bal = (await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer] })) as bigint;
console.log("deployer USDC:", bal.toString(), "needed:", total.toString());
if (bal < total) {
  console.log("INSUFFICIENT — aborting");
  process.exit(1);
}

const approveTx = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [ARENA, total] });
console.log("approve:", approveTx);
await publicClient.waitForTransactionReceipt({ hash: approveTx });

for (const [key, amount] of FUNDS) {
  const targetKey = keccak256(toBytes(key));
  const tx = await wallet.writeContract({ address: ARENA, abi: arenaAbi, functionName: "fundPool", args: [targetKey, amount] });
  console.log(`fundPool ${key} ${amount / 1_000_000n} USDC:`, tx);
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

for (const [key] of FUNDS) {
  const pool = (await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "targets", args: [keccak256(toBytes(key))] })) as [bigint, boolean];
  console.log(`${key} pool now:`, pool[0].toString(), "exists:", pool[1]);
}
process.exit(0);
