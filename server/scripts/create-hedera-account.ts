import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  AccountBalanceQuery,
} from "@hiero-ledger/sdk";

export const DEFAULT_KEY_STORE = path.join(import.meta.dir, ".hedera-accounts.json");

export interface CreatedAccount {
  label: string;
  accountId: string;
  evmAddress: string;
  publicKey: string;
  privateKey: string;
}

export interface AccountLedger {
  createAccount(publicKey: string, initialHbar: number): Promise<string>;
  hbarBalance(accountId: string): Promise<string>;
}

async function readStore(storePath: string): Promise<Record<string, CreatedAccount>> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`account store at ${storePath} is not an object`);
    }
    return parsed as Record<string, CreatedAccount>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error instanceof SyntaxError
      ? new Error(`account store at ${storePath} is not valid JSON; inspect it before rerunning`)
      : error;
  }
}

async function writeStore(storePath: string, store: Record<string, CreatedAccount>): Promise<void> {
  const temporary = `${storePath}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
  await rename(temporary, storePath);
  await chmod(storePath, 0o600);
}

/**
 * Creates one labelled account, or returns the recorded one. Resumable: the
 * label is the identity, so a rerun never creates a second account and never
 * spends again.
 */
export async function ensureAccount(
  label: string,
  initialHbar: number,
  ledger: AccountLedger,
  storePath: string = DEFAULT_KEY_STORE
): Promise<{ account: CreatedAccount; created: boolean }> {
  const store = await readStore(storePath);
  const existing = store[label];
  if (existing) return { account: existing, created: false };

  const key = PrivateKey.generateECDSA();
  const accountId = await ledger.createAccount(key.publicKey.toStringDer(), initialHbar);
  const account: CreatedAccount = {
    label,
    accountId,
    evmAddress: `0x${key.publicKey.toEvmAddress()}`,
    publicKey: key.publicKey.toStringDer(),
    privateKey: key.toStringDer(),
  };
  store[label] = account;
  await writeStore(storePath, store);
  return { account, created: true };
}

function testnetLedger(operatorAccountId: string, operatorKey: PrivateKey): AccountLedger {
  const client = Client.forTestnet().setOperator(operatorAccountId, operatorKey);
  return {
    async createAccount(publicKey, initialHbar) {
      const receipt = await (
        await new AccountCreateTransaction()
          .setKeyWithoutAlias(PublicKey.fromString(publicKey))
          .setInitialBalance(new Hbar(initialHbar))
          .execute(client)
      ).getReceipt(client);
      if (!receipt.accountId) throw new Error("account creation receipt did not include an account ID");
      return receipt.accountId.toString();
    },
    async hbarBalance(accountId) {
      return (await new AccountBalanceQuery().setAccountId(accountId).execute(client)).hbars.toString();
    },
  };
}

if (import.meta.main) {
  const label = process.argv[2];
  const initialHbar = Number(process.argv[3] ?? "0");
  if (!label || !Number.isFinite(initialHbar) || initialHbar < 0) {
    console.error("usage: bun run scripts/create-hedera-account.ts <label> <initialHbar>");
    process.exit(1);
  }
  const operatorAccountId = process.env.DEMO_HTS_OPERATOR_ACCOUNT_ID;
  const operatorPrivateKey = process.env.DEMO_HTS_OPERATOR_PRIVATE_KEY;
  if (!operatorAccountId || !operatorPrivateKey) {
    console.error("DEMO_HTS_OPERATOR_ACCOUNT_ID and DEMO_HTS_OPERATOR_PRIVATE_KEY are required");
    process.exit(1);
  }
  const ledger = testnetLedger(operatorAccountId, PrivateKey.fromStringECDSA(operatorPrivateKey));
  const { account, created } = await ensureAccount(label, initialHbar, ledger);
  console.log(
    JSON.stringify({
      event: "hedera-account",
      label: account.label,
      accountId: account.accountId,
      evmAddress: account.evmAddress,
      created,
      operatorRemaining: await ledger.hbarBalance(operatorAccountId),
      keyStore: DEFAULT_KEY_STORE,
    })
  );
}
