import { describe, expect, it } from "bun:test";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateAgentWallet,
} from "../src/wallet.ts";

const SECRET = "test-secret-please-change";

describe("generateAgentWallet", () => {
  it("returns a valid checksummed address matching the private key", () => {
    const { address, privateKey } = generateAgentWallet();

    expect(isAddress(address)).toBe(true);
    expect(address).toMatch(/^0x[0-9A-Fa-f]{40}$/);
    expect(privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(privateKeyToAccount(privateKey).address).toBe(address);
  });

  it("generates distinct wallets on each call", () => {
    const a = generateAgentWallet();
    const b = generateAgentWallet();
    expect(a.address).not.toBe(b.address);
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

describe("encryptPrivateKey / decryptPrivateKey", () => {
  it("round-trips the original private key", () => {
    const { privateKey } = generateAgentWallet();
    const encrypted = encryptPrivateKey(privateKey, SECRET);

    expect(encrypted).not.toBe(privateKey);
    expect(decryptPrivateKey(encrypted, SECRET)).toBe(privateKey);
  });

  it("throws when decrypting with the wrong secret", () => {
    const { privateKey } = generateAgentWallet();
    const encrypted = encryptPrivateKey(privateKey, SECRET);

    expect(() => decryptPrivateKey(encrypted, "wrong-secret")).toThrow();
  });

  it("uses a fresh random IV per encryption (non-deterministic)", () => {
    const { privateKey } = generateAgentWallet();
    const e1 = encryptPrivateKey(privateKey, SECRET);
    const e2 = encryptPrivateKey(privateKey, SECRET);

    expect(e1).not.toBe(e2);
  });
});
