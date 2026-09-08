import type { Erc8004Client } from "./erc8004.ts";

/**
 * Real ERC-8004 mainnet path — enabled only when ERC8004_MAINNET_KEY is set.
 *
 * Integration point for the `agent0` SDK against the mainnet registries:
 *   - Identity Registry  (0x8004A169...) — mintAgentIdentity
 *   - Reputation Registry (0x8004BAa1...) — writeAgentFeedback
 *
 * The agent0 SDK API is loaded lazily here so dev machines never install or
 * execute it. Until the SDK is pinned, these throw a descriptive error rather
 * than silently faking mainnet writes.
 */
export async function mintAgentIdentity(
  client: Erc8004Client,
  agentAddress: string
): Promise<string> {
  void client;
  void agentAddress;
  throw new Error(
    "ERC-8004 real mint not wired yet: set ERC8004_MAINNET_KEY only when agent0 SDK integration exists"
  );
}

export async function writeAgentFeedback(
  client: Erc8004Client,
  agentTokenId: string,
  outcome: "VALID" | "INVALID"
): Promise<string> {
  void client;
  void agentTokenId;
  void outcome;
  throw new Error(
    "ERC-8004 real feedback not wired yet: set ERC8004_MAINNET_KEY only when agent0 SDK integration exists"
  );
}
