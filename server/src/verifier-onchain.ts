import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getTargetSpec, loadArtifact } from "./deploy-target.ts";
import { serverConfig } from "./config.ts";
import type { ExploitCall, Verdict } from "./verifier-local.ts";

/** Give top-ups time to propagate through the RPC relay before the agent spends. */
const CONSENSUS_PROPAGATION_MS = 10_000;
/** HBAR granted to a fresh agent wallet at submission to cover gas for a
 *  handful of contract calls at testnet prices. Tune if calls run out of gas. */
const AGENT_GAS_TOPUP = 1_000_000_000_000_000_000n; // 1 HBAR
// A fresh agent wallet has no Hedera account. Paying it creates one lazily,
// which costs far more than the 21k gas an ordinary transfer needs.
const LAZY_ACCOUNT_CREATE_GAS = 800_000n;
const EXPLOIT_CALL_GAS = 300_000n;
/** Wait up to this long for the top-up balance to catch up. */
const TOPUP_WAIT_MS = 30_000;

export interface OnchainResult {
  verdict: Verdict;
  exploitTxHash: string;
}

const hederaTestnet = (): Chain => ({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [serverConfig.rpcUrl] } },
  testnet: true,
});

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

/**
 * Real-submission verifier: deploys a FRESH copy of the target on Hedera
 * testnet (per-attempt isolation), replays the submitted calls signed by the
 * agent's own wallet, and judges via invariantHolds(). The deploy is signed by
 * the server's verifier key; each exploit call is signed by `agentSignerKey`,
 * so every `caller` in the exploit MUST equal the agent's address (the wallet
 * must be funded with HBAR for gas — the server tops it up at registration).
 */
export async function runOnchainVerification(
  targetKey: string,
  exploitCalls: ExploitCall[],
  agentSignerKey: `0x${string}`
): Promise<OnchainResult> {
  const spec = getTargetSpec(targetKey);
  const { abi, bytecode } = loadArtifact(spec);

  const agentAccount = privateKeyToAccount(agentSignerKey);
  const agentAddress = agentAccount.address;
  const deployer = privateKeyToAccount(serverConfig.verifierKey);

  // Two signers exist for the fresh instance:
  //  - the deployer (verifier) is the `beneficiary`/owner seeded into targets
  //    like TimeWindowVault — calls from it must be signed with the verifier key;
  //  - everything else is the submitting agent's wallet.
  const canSignAs = (caller: string): "deployer" | "agent" =>
    caller.toLowerCase() === deployer.address.toLowerCase() ? "deployer" : "agent";
  for (const call of exploitCalls) {
    const signer = canSignAs(call.caller);
    if (signer === "agent" && call.caller.toLowerCase() !== agentAddress.toLowerCase()) {
      throw new Error(
        `exploit call '${call.entryPoint}' caller ${call.caller} != agent wallet ${agentAddress} — ` +
          "onchain calls are signed by your agent wallet (or the verifier/beneficiary)"
      );
    }
  }

  const transport = http(serverConfig.rpcUrl);
  const publicClient: PublicClient = createPublicClient({
    chain: hederaTestnet(),
    transport,
  });
  const deployerClient: WalletClient = createWalletClient({
    chain: hederaTestnet(),
    transport,
    account: deployer,
  });
  const agentClient: WalletClient = createWalletClient({
    chain: hederaTestnet(),
    transport,
    account: agentAccount,
  });

  // Gas top-up: the agent wallet is fresh and has no HBAR. The server funds it
  // from the verifier (which is also the deployer), then waits for the balance
  // to propagate through the relay before the agent can spend.
  const agentBalance = await publicClient.getBalance({ address: agentAddress });
  if (agentBalance < AGENT_GAS_TOPUP / 2n) {
    const topUpHash = await deployerClient.sendTransaction({
      to: agentAddress,
      value: AGENT_GAS_TOPUP,
      gas: LAZY_ACCOUNT_CREATE_GAS,
    });
    const topUpReceipt = await publicClient.waitForTransactionReceipt({ hash: topUpHash });
    if (topUpReceipt.status !== "success") {
      throw new Error(
        `agent gas top-up ${topUpHash} did not succeed (${topUpReceipt.status}); ` +
          "the agent wallet cannot sign exploit calls without HBAR"
      );
    }
    const deadline = Date.now() + TOPUP_WAIT_MS;
    while (Date.now() < deadline) {
      const bal = await publicClient.getBalance({ address: agentAddress });
      if (bal >= AGENT_GAS_TOPUP) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Consensus runs on a k-block lagged state: the agent's balance may show
    // as topped up at execution time while the consensus view still sees 0,
    // which makes the FIRST agent-signed tx fail with "internal error".
    await new Promise((r) => setTimeout(r, CONSENSUS_PROPAGATION_MS));
  }

  const beneficiary = deployer.address;
  const deployHash = await deployerClient.deployContract({
    abi,
    bytecode,
    args: spec.ctorArgs(beneficiary),
  });
  await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const receipt = await publicClient.getTransactionReceipt({ hash: deployHash });
  const target = receipt.contractAddress as Address;

  const pre = (await publicClient.readContract({
    address: target,
    abi,
    functionName: "invariantHolds",
  })) as boolean;

  let exploitTxHash = deployHash;
  for (const call of exploitCalls) {
    const data = encodeFunctionData({
      abi,
      functionName: call.entryPoint,
      args: resolveArgs(abi, call.entryPoint, call.args),
    });
    // Gas is set explicitly rather than estimated: Hedera estimates against a
    // lagged consensus view, so a call whose cost depends on state written by
    // an earlier call in this same exploit is under-estimated and runs out.
    // The signer matches the caller: beneficiary/owner calls (e.g. TimeWindowVault
    // claims) are signed with the verifier key, everything else with the agent.
    const signer = canSignAs(call.caller) === "deployer" ? deployerClient : agentClient;
    const txHash = await signer.sendTransaction({ to: target, data, gas: EXPLOIT_CALL_GAS });
    const callReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (callReceipt.status !== "success") {
      // Fail closed. A verdict is only meaningful when every submitted call
      // actually executed; settling on a failed call would slash a stake for
      // an execution fault rather than for a wrong claim.
      throw new Error(
        `exploit call '${call.entryPoint}' did not execute (${callReceipt.status}, tx ${txHash})`
      );
    }
    exploitTxHash = txHash;

    // Time-dependent exploits (waitBlocks): poll until the block count has
    // advanced the requested amount.
    if (call.waitBlocks && call.waitBlocks > 0) {
      const targetBlock = (await publicClient.getBlockNumber()) + BigInt(call.waitBlocks);
      const waitDeadline = Date.now() + call.waitBlocks * 5000; // up to 5s/block
      while (Date.now() < waitDeadline) {
        if ((await publicClient.getBlockNumber()) >= targetBlock) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  const post = (await publicClient.readContract({
    address: target,
    abi,
    functionName: "invariantHolds",
  })) as boolean;

  return { verdict: pre && !post ? "VALID" : "INVALID", exploitTxHash };
}
