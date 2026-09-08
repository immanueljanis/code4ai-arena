import { createPublicClient, http, keccak256, toBytes, encodePacked } from "viem";

const RPC = "https://testnet.hashio.io/api";
const ARENA = "0xb8c3e39305bdb70eb9a0c7ae848eecbfbf5293d5";
const chain = { id: 296, name: "Hedera Testnet", nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, testnet: true } as const;
const client = createPublicClient({ chain, transport: http(RPC) });

const arenaAbi = [
  { type: "function", name: "targets", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "pool", type: "uint256" }, { name: "exists", type: "bool" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
] as const;

// invariantIds as observed in actual on-chain Paid events (deployed server):
const INVARIANTS = {
  "access-control-vault": "0x213358cec2d4069fe9158e6a22199ed02789b6e1fe3b0cea44e668b263478b0a",
  "rounding-vault": "0x559ac7f25a92b7fe473d4a8e34cabaa0c12bd4c3e7d9e90230eee5da6c7e0549",
  "time-window-vault": "0xdbb1b863de431b524b511cfabd7156e56ae658900d9114a472b23906145709a9",
};

console.log("check with event-observed invariantIds:");
for (const key of Object.keys(INVARIANTS)) {
  const targetKey = keccak256(toBytes(key));
  const pool = (await client.readContract({ address: ARENA as `0x${string}`, abi: arenaAbi, functionName: "targets", args: [targetKey] })) as [bigint, boolean];
  const claimKey = keccak256(encodePacked(["bytes32", "bytes32"], [targetKey, INVARIANTS[key] as `0x${string}`]));
  const claimed = (await client.readContract({ address: ARENA as `0x${string}`, abi: arenaAbi, functionName: "claimed", args: [claimKey] })) as boolean;
  console.log(`  ${key}: pool=${(pool[0] / 1_000_000n).toString()} USDC | claimed=${claimed}`);
}

// brute-force: which strings hash to the observed invariantIds?
console.log("\nreverse-hash candidates:");
const candidates = ["cadence-respected", "no-overpay", "balance-preserved", "time-window-cadence", "cadenceRespected", "time-window", "vault-cadence", "access-control", "rounding", "time-window-vault"];
for (const name of candidates) {
  const h = keccak256(toBytes(name));
  for (const [key, inv] of Object.entries(INVARIANTS)) {
    if (h === inv) console.log(`  ${key} => keccak("${name}")`);
  }
}
