import { createPublicClient, http, keccak256, toBytes, encodePacked, parseAbi } from "viem";

const RPC = "https://testnet.hashio.io/api";
const chain = { id: 296, name: "Hedera Testnet", nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, testnet: true } as const;
const client = createPublicClient({ chain, transport: http(RPC) });

const paidEvent = parseAbi(["event Paid(bytes32 targetKey, bytes32 invariantId, address agent, uint256 stakeAmount, uint256 bountyAmount)"]);

const txHashes = [
  "0x628f5aa38113564675df524d06b67f4baf126f40b106a1a51ae4bcb6ca0a4aad", // time-window VALID payout
  "0x0000000000000000000000000000000000000000000000000000000000000000", // access-control — find below
];

for (const hash of txHashes) {
  if (hash === "0x0000000000000000000000000000000000000000000000000000000000000000") continue;
  try {
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    const logs = await client.getContractEvents({ address: receipt.contractAddress, abi: paidEvent, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
    for (const log of logs) {
      console.log(`tx ${hash.slice(0, 12)}... targetKey=${log.args.targetKey} invariantId=${log.args.invariantId} bounty=${log.args.bountyAmount}`);
    }
  } catch (e) {
    console.log(`tx ${hash.slice(0, 12)}... err: ${(e as Error).message.slice(0, 100)}`);
  }
}
