import { insertAgent } from "../src/db.ts";
import { serverConfig } from "../src/config.ts";
import { encryptPrivateKey, generateAgentWallet } from "../src/wallet.ts";
import { provisionAgent } from "../src/provision.ts";

const log = (event: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...data }));

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
