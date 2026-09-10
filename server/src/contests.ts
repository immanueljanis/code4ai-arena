import { readFileSync } from "node:fs";
import path from "node:path";
import { keccak256, toBytes } from "viem";
import { sql, type TargetRow } from "./db.ts";

/** Target registry metadata (R8: invariant text/ids NEVER stored or served). */
export interface TargetMeta {
  key: string;
  contractFile: string;
  contractName: string;
  objective: string;
  invariantCount: number;
  stakeAmount: string; // USDC, 6 decimals as integer-scaled
  /** Internal invariant id (keccak of the canonical name) — never served. */
  invariantId: string;
  bountyAmount: string; // USDC, 6 decimals
}

export const TARGET_META: TargetMeta[] = [
  {
    key: "access-control-vault",
    contractFile: "AccessControlVault.sol",
    contractName: "AccessControlVault",
    objective: "Seize ownership of the vault and drain its balance.",
    invariantCount: 1,
    stakeAmount: "1000000",
    invariantId: keccak256(toBytes("balance-preserved")),
    bountyAmount: "1000000",
  },
  {
    key: "rounding-vault",
    contractFile: "RoundingVault.sol",
    contractName: "RoundingVault",
    objective: "Extract more from the share vault than was ever deposited.",
    invariantCount: 1,
    stakeAmount: "1000000",
    invariantId: keccak256(toBytes("no-overpay")),
    bountyAmount: "1000000",
  },
  {
    key: "reentrancy-vault",
    contractFile: "ReentrancyVault.sol",
    contractName: "ReentrancyVault",
    objective: "Withdraw twice before the vault updates its accounting.",
    invariantCount: 1,
    stakeAmount: "1000000",
    invariantId: keccak256(toBytes("balance-backed")),
    bountyAmount: "1000000",
  },
  {
    key: "time-window-vault",
    contractFile: "TimeWindowVault.sol",
    contractName: "TimeWindowVault",
    objective: "Drain the allowance faster than the budget was sized for.",
    invariantCount: 1,
    stakeAmount: "1000000",
    invariantId: keccak256(toBytes("cadence-respected")),
    bountyAmount: "1000000",
  },
];

export function getTargetMeta(key: string): TargetMeta | undefined {
  return TARGET_META.find((t) => t.key === key);
}

/** Seed the 3 targets + their invariants (idempotent). Called at startup. */
export async function seedTargets(): Promise<void> {
  for (const t of TARGET_META) {
    await sql`
      INSERT INTO targets (key, contract_address, objective, invariant_count, stake_amount)
      VALUES (${t.key}, ${"0x0"}, ${t.objective}, ${t.invariantCount}, ${t.stakeAmount})
      ON CONFLICT (key) DO UPDATE SET
        objective = EXCLUDED.objective,
        invariant_count = EXCLUDED.invariant_count,
        stake_amount = EXCLUDED.stake_amount
    `;
    await sql`
      INSERT INTO invariants (id, target_key, bounty_amount, claimed)
      VALUES (${t.invariantId}, ${t.key}, ${t.bountyAmount}, false)
      ON CONFLICT (id) DO UPDATE SET
        bounty_amount = EXCLUDED.bounty_amount,
        claimed = EXCLUDED.claimed
    `;
  }
}

export async function listTargetRows(): Promise<TargetRow[]> {
  return (await import("./db.ts")).listTargets();
}

/** Read the target's Solidity source as-is (contracts/src/<File>.sol). */
export function targetSource(key: string): string {
  const meta = getTargetMeta(key);
  if (!meta) throw new Error(`unknown target key: ${key}`);
  const srcDir = process.env.CONTRACTS_SRC_DIR ?? path.join("..", "contracts", "src");
  return readFileSync(path.join(srcDir, meta.contractFile), "utf8");
}
