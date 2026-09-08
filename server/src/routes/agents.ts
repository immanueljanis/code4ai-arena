import { Hono } from "hono";
import { insertAgent } from "../db.ts";
import { mintIdentity } from "../erc8004.ts";
import { encryptPrivateKey, generateAgentWallet } from "../wallet.ts";
import { serverConfig } from "../config.ts";

export const agents = new Hono();

/** External auditor agents register their own identity (agent-native API). */
agents.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "";
  if (!label) {
    return c.json({ error: "label is required" }, 400);
  }

  const { address, privateKey } = generateAgentWallet();
  const encrypted = encryptPrivateKey(privateKey, serverConfig.serverWalletSecret);
  const erc8004TokenId = await mintIdentity(address);

  const id = await insertAgent({
    label,
    walletAddress: address,
    encryptedPrivateKey: encrypted,
    erc8004TokenId,
  });

  return c.json(
    { id, label, walletAddress: address, erc8004TokenId },
    201
  );
});
