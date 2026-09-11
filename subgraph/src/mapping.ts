import { ethereum } from "@graphprotocol/graph-ts";
import { VerifyHeaderAndExecuteTxEvent } from "../generated/PolyManager/PolyManager";
import { Transfer as ResupplyTransfer } from "../generated/ResupplyToken/ResupplyToken";
import { Transfer as DaoTransfer } from "../generated/TheDao/TheDao";
import { HistoricalExploit } from "../generated/schema";

const POLY_TX = "0xb1f70464bd95b774c6ce60fc706eb5f9e35cb5f06e6cfe7c17dcda46ffd59581";
const RESUPPLY_TX = "0xffbbd492e0605a8bb6d490c3cd879e87ff60862b0684160d08fd5711e7a872d3";
const DAO_TX = "0x0ec3f2488a93839524add10ea229e773f6bc891b4eb4794c3337d4495263790b";

function saveExploit(
  event: ethereum.Event,
  targetKey: string,
  incident: string,
  technique: string,
  lossUsd: string,
  sourceUrl: string,
): void {
  // One attack transaction emits the watched event many times; the entity is
  // immutable and keyed by that transaction, so only the first write may land.
  if (HistoricalExploit.load(event.transaction.hash) != null) return;
  const entity = new HistoricalExploit(event.transaction.hash);
  entity.targetKey = targetKey;
  entity.incident = incident;
  entity.technique = technique;
  entity.lossUsd = lossUsd;
  entity.chain = "ethereum-mainnet";
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.attackTx = event.transaction.hash;
  entity.attacker = event.transaction.from;
  entity.victim = event.address;
  entity.sourceUrl = sourceUrl;
  entity.save();
}

export function handlePolyExploit(event: VerifyHeaderAndExecuteTxEvent): void {
  if (event.transaction.hash.toHexString() !== POLY_TX) return;
  saveExploit(
    event,
    "access-control-vault",
    "Poly Network",
    "cross-chain access control failure",
    "611000000",
    "https://medium.com/poly-network/honour-exploit-and-code-how-we-lost-610m-dollar-and-got-it-back-c4a7d0606267",
  );
}

export function handleResupplyExploit(event: ResupplyTransfer): void {
  if (event.transaction.hash.toHexString() !== RESUPPLY_TX) return;
  saveExploit(
    event,
    "rounding-vault",
    "Resupply Finance",
    "first-depositor share inflation",
    "9600000",
    "https://crypto.training/hacks/2025-06-resupplyfi/",
  );
}

export function handleDaoExploit(event: DaoTransfer): void {
  if (event.transaction.hash.toHexString() !== DAO_TX) return;
  saveExploit(
    event,
    "reentrancy-vault",
    "The DAO",
    "recursive withdrawal before state update",
    "60000000",
    "https://blog.ethereum.org/2016/06/17/critical-update-re-dao-vulnerability",
  );
}
