import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return Buffer.from(secret.padEnd(32, "x").slice(0, 32), "utf8");
}

export function generateAgentWallet(): { address: `0x${string}`; privateKey: `0x${string}` } {
  const privateKey = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  return { address: privateKeyToAccount(privateKey).address, privateKey };
}

/** AES-256-GCM: base64(iv || tag || ciphertext). */
export function encryptPrivateKey(privateKey: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Inverse of encryptPrivateKey. Throws on wrong secret (auth tag mismatch). */
export function decryptPrivateKey(encrypted: string, secret: string): string {
  const buf = Buffer.from(encrypted, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) throw new Error("malformed ciphertext");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
