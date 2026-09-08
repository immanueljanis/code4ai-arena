import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getTargetSpec, loadArtifact } from "./deploy-target.ts";
import { serverConfig } from "./config.ts";

/** A declarative exploit call, mirroring the plan's shared ExploitCall type. */
export interface ExploitCall {
  caller: string;
  entryPoint: string;
  args: Record<string, unknown>;
  /**
   * Optional: wait this many blocks after this call before replaying the next
   * one. Needed for time-dependent targets (e.g. TimeWindowVault's 60-block
   * refill cadence). On Anvil this is simulated instantly (anvil_mine);
   * on the live chain the verifier polls block.number.
   */
  waitBlocks?: number;
}

export type Verdict = "VALID" | "INVALID";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForRpc(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        });
        if (res.ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("anvil did not start in time"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

/** Positional args for a function, resolved by name against the ABI. */
function resolveArgs(abi: unknown[], fn: string, named: Record<string, unknown>): unknown[] {
  const item = (abi as { type: string; name: string; inputs: { name: string }[] }[]).find(
    (x) => x.type === "function" && x.name === fn
  );
  if (!item) throw new Error(`unknown entryPoint '${fn}'`);
  return item.inputs.map((inp) => {
    if (inp.name && inp.name in named) return named[inp.name];
    throw new Error(`missing arg '${inp.name}' for ${fn}`);
  });
}

async function waitForTx(publicClient: PublicClient, hash: `0x${string}`): Promise<void> {
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
}

/**
 * Spin up a throwaway Anvil instance, deploy the target fresh, replay the
 * submitted calls, and judge via invariantHolds() pre/post. No payment.
 */
export async function runPlaygroundVerification(
  targetKey: string,
  exploitCalls: ExploitCall[]
): Promise<Verdict> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const spec = getTargetSpec(targetKey);
  const { abi, bytecode } = loadArtifact(spec);

  // Anvil's bundled dev account #0 — funded by default; the real verifier key
  // has no balance on a fresh local chain, so playground deploys with this.
  const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
  const beneficiary = privateKeyToAccount(ANVIL_KEY).address;
  const anvil: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: "ignore",
  });

  try {
    await waitForRpc(url);

    const transport = http(url);
    const publicClient = createPublicClient({ transport });
    const walletClient = createWalletClient({ transport, account: privateKeyToAccount(ANVIL_KEY) });

    const deployHash = await walletClient.deployContract({
      abi,
      bytecode,
      args: spec.ctorArgs(beneficiary),
    });
    await waitForTx(publicClient, deployHash);
    const receipt = await publicClient.getTransactionReceipt({ hash: deployHash });
    const target = receipt.contractAddress as Address;

    const pre = (await publicClient.readContract({
      address: target,
      abi,
      functionName: "invariantHolds",
    })) as boolean;

    for (const call of exploitCalls) {
      const caller = call.caller as Address;
      await publicClient.request({
        method: "anvil_setBalance",
        params: [caller, "0xDE0B6B3A7640000"], // 1 ETH — caller may not be a default anvil account
      });
      // Anvil can act as any account once impersonated — no signature needed.
      await publicClient.request({ method: "anvil_impersonateAccount", params: [caller] });
      const data = encodeFunctionData({
        abi,
        functionName: call.entryPoint,
        args: resolveArgs(abi, call.entryPoint, call.args),
      });
      const txHash = (await publicClient.request({
        method: "eth_sendTransaction",
        params: [{ from: caller, to: target, data }],
      })) as `0x${string}`;
      await waitForTx(publicClient, txHash);

      // Simulate block progression instantly (anvil_mine) so time-dependent
      // exploits (waitBlocks) don't slow the playground down. Params must be
      // hex strings: ["0x3c"] (anvil rejects numbers/objects).
      if (call.waitBlocks && call.waitBlocks > 0) {
        await publicClient.request({
          method: "anvil_mine",
          params: [`0x${call.waitBlocks.toString(16)}`],
        });
      }
    }

    const post = (await publicClient.readContract({
      address: target,
      abi,
      functionName: "invariantHolds",
    })) as boolean;

    return pre && !post ? "VALID" : "INVALID";
  } finally {
    anvil.kill("SIGTERM");
  }
}
