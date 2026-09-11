import {
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
} from "@hiero-ledger/sdk";
import { createPublicClient, createWalletClient, http, type Address, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig } from "../src/config.ts";
import { getAgent, insertAgent } from "../src/db.ts";
import { decryptPrivateKey, encryptPrivateKey, generateAgentWallet } from "../src/wallet.ts";

const AGENT_GAS = 1_000_000_000_000_000_000n;
const LAZY_ACCOUNT_CREATE_GAS = 800_000n;
const MIRROR = process.env.HEDERA_MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";

const chain = (): Chain => ({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [serverConfig.rpcUrl] } },
  testnet: true,
});

const log = (event: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...data }));

async function hederaAccountFor(address: string): Promise<string | null> {
  const response = await fetch(`${MIRROR}/api/v1/accounts/${address}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  return ((await response.json()) as { account?: string }).account ?? null;
}

async function isAssociated(accountId: string, tokenId: string): Promise<boolean> {
  const response = await fetch(`${MIRROR}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return false;
  return (((await response.json()) as { tokens?: unknown[] }).tokens ?? []).length > 0;
}

/**
 * Bring an agent to the state the x402 stake leg assumes: a real Hedera account
 * (lazily created by paying it), and an association with the settlement token
 * so it can hold and send the stake. Resumable — every step is skipped when it
 * is already satisfied, so a rerun spends nothing.
 */
export async function provisionAgent(agentId: string): Promise<{
  agentId: string;
  address: string;
  accountId: string;
}> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);
  const address = agent.walletAddress as Address;

  const transport = http(serverConfig.rpcUrl, { retryCount: 5, retryDelay: 1500 });
  const publicClient = createPublicClient({ chain: chain(), transport });
  const operator = privateKeyToAccount(serverConfig.verifierKey);
  const wallet = createWalletClient({ chain: chain(), transport, account: operator });

  const balance = await publicClient.getBalance({ address });
  if (balance < AGENT_GAS / 2n) {
    const hash = await wallet.sendTransaction({
      to: address,
      value: AGENT_GAS,
      gas: LAZY_ACCOUNT_CREATE_GAS,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`agent gas transfer failed (${hash})`);
    log("agent-funded", { address, hash });
  } else {
    log("agent-already-funded", { address });
  }

  let accountId: string | null = null;
  for (let i = 0; i < 20 && !accountId; i++) {
    accountId = await hederaAccountFor(address);
    if (!accountId) await Bun.sleep(3000);
  }
  if (!accountId) throw new Error(`agent ${address} has no Hedera account yet`);

  const tokenId = serverConfig.settlementTokenId;
  if (await isAssociated(accountId, tokenId)) {
    log("agent-already-associated", { accountId, tokenId });
  } else {
    const key = PrivateKey.fromStringECDSA(
      decryptPrivateKey(agent.encryptedPrivateKey, serverConfig.serverWalletSecret)
    );
    const client = Client.forTestnet().setOperator(AccountId.fromString(accountId), key);
    try {
      const transaction = await new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(key);
      await (await transaction.execute(client)).getReceipt(client);
      log("agent-associated", { accountId, tokenId });
    } finally {
      client.close();
    }
  }

  return { agentId, address, accountId };
}

if (import.meta.main) {
  const existing = process.argv[2];
  let agentId = existing;
  if (!agentId) {
    const wallet = generateAgentWallet();
    agentId = await insertAgent({
      label: `agent-${Date.now().toString(36)}`,
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptPrivateKey(wallet.privateKey, serverConfig.serverWalletSecret),
      erc8004TokenId: `mock-id:${Date.now().toString(36)}`,
    });
    log("agent-created", { agentId, address: wallet.address });
  }
  const result = await provisionAgent(agentId);
  log("agent-ready", { ...result, token: serverConfig.settlementTokenId });
}
