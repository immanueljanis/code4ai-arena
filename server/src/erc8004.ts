import { createHash } from "node:crypto";
import { serverConfig } from "./config.ts";

/** Hedera mainnet ERC-8004 registries (only real path touches mainnet). */
export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
export const MAINNET_CHAIN_ID = 143;

export interface Erc8004Client {
  identityRegistry: string;
  reputationRegistry: string;
  chainId: number;
  signerKey: `0x${string}`;
}

/**
 * Real-mode client construction. The agent0 SDK is imported lazily so dev
 * machines without a mainnet key never touch mainnet (and never spend gas).
 */
export function createErc8004Client(mainnetKey: string): Erc8004Client {
  return {
    identityRegistry: IDENTITY_REGISTRY,
    reputationRegistry: REPUTATION_REGISTRY,
    chainId: MAINNET_CHAIN_ID,
    signerKey: mainnetKey as `0x${string}`,
  };
}

function mockTx(seed: string): string {
  return `0x${createHash("sha256").update(seed).digest("hex")}`;
}

/**
 * Mint an ERC-8004 identity for the agent's wallet. Mock mode (no mainnet key)
 * returns a deterministic fake token id; real mode (agent0 SDK + mainnet gas)
 * is only enabled when ERC8004_MAINNET_KEY is set.
 */
export async function mintIdentity(agentAddress: string): Promise<string> {
  if (serverConfig.erc8004MainnetKey) {
    // Real path: agent0 SDK against the mainnet Identity Registry.
    // (Lazy import keeps the dependency off dev machines.)
    const { mintAgentIdentity } = await import("./erc8004-real.ts");
    return mintAgentIdentity(createErc8004Client(serverConfig.erc8004MainnetKey), agentAddress);
  }
  return `mock-id:${createHash("sha256").update(agentAddress).digest("hex").slice(0, 16)}`;
}

/**
 * Write a signed reputation feedback for a verdict. Mock mode returns a fake
 * tx hash; real mode writes to the mainnet Reputation Registry.
 */
export async function writeReputationFeedback(
  agentTokenId: string,
  outcome: "VALID" | "INVALID"
): Promise<string> {
  if (serverConfig.erc8004MainnetKey) {
    const { writeAgentFeedback } = await import("./erc8004-real.ts");
    return writeAgentFeedback(
      createErc8004Client(serverConfig.erc8004MainnetKey),
      agentTokenId,
      outcome
    );
  }
  return mockTx(`feedback:${agentTokenId}:${outcome}:${Date.now()}`);
}
