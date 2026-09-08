import { readFileSync } from "node:fs";
import path from "node:path";

export interface TargetSpec {
  targetKey: string;
  artifactFile: string;
  contractName: string;
  /** Constructor args — resolved at deploy time. */
  ctorArgs: (defaultBeneficiary: `0x${string}`) => unknown[];
}

/** Canonical registry: targetKey → contract artifact (matches contracts/out). */
export const TARGETS: TargetSpec[] = [
  {
    targetKey: "access-control-vault",
    artifactFile: "AccessControlVault.sol/AccessControlVault.json",
    contractName: "AccessControlVault",
    ctorArgs: () => [],
  },
  {
    targetKey: "rounding-vault",
    artifactFile: "RoundingVault.sol/RoundingVault.json",
    contractName: "RoundingVault",
    ctorArgs: () => [],
  },
  {
    targetKey: "time-window-vault",
    artifactFile: "TimeWindowVault.sol/TimeWindowVault.json",
    contractName: "TimeWindowVault",
    ctorArgs: (beneficiary) => [beneficiary],
  },
];

export function getTargetSpec(targetKey: string): TargetSpec {
  const spec = TARGETS.find((t) => t.targetKey === targetKey);
  if (!spec) throw new Error(`unknown target key: ${targetKey}`);
  return spec;
}

export interface LoadedArtifact {
  abi: unknown[];
  bytecode: `0x${string}`;
}

export function loadArtifact(spec: TargetSpec): LoadedArtifact {
  const outDir = process.env.CONTRACTS_OUT_DIR ?? path.join("..", "contracts", "out");
  const file = path.join(outDir, spec.artifactFile);
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    abi: unknown[];
    bytecode: { object: string } | string;
  };
  const bytecode =
    typeof raw.bytecode === "string" ? raw.bytecode : raw.bytecode.object;
  return { abi: raw.abi, bytecode: bytecode as `0x${string}` };
}
