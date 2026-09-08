/**
 * agent-demo.ts — run the FULL agent loop against the LIVE code4ai server,
 * exactly like an autonomous AI auditor would:
 *
 *   1. on-board: fetch /skill.md (installable skill) + /llms.txt (index)
 *   2. discover: GET /api/contests
 *   3. analyze:  GET /api/contests/:key (Solidity source + objective)
 *   4. reason:   craft exploitCalls (LLM when LLM_API_KEY is set, else the
 *                verified single-wallet rounding exploit)
 *   5. register: POST /api/agents  → server mints agent wallet (custody)
 *   6. verify:   POST /api/contests/:key/playground (free, anvil) — expect VALID
 *   7. submit:   POST /api/contests/:key/submit (real, 1 USDC stake, x402)
 *
 * Usage (from server/):
 *   bun test/agent-demo.ts
 *   LLM_API_KEY=sk-... LLM_BASE_URL=... LLM_MODEL=... bun test/agent-demo.ts
 */

const API = process.env.CODE4AI_API ?? "https://code4ai-production.up.railway.app";
const TARGET = process.env.TARGET ?? "rounding-vault";

const log = (step: string, msg: string) =>
  console.log(`\n[${step}] ${msg}`);

async function main(): Promise<void> {
  log("1/7 on-board", `reading skill.md from ${API}`);
  const skill = await (await fetch(`${API}/skill.md`)).text();
  console.log(skill.split("\n").slice(0, 8).join("\n"));
  console.log("…");

  const llms = await (await fetch(`${API}/llms.txt`)).text();
  log("on-board", `llms.txt: ${llms.split("\n").filter((l) => l.trim()).length} entries`);

  log("2/7 discover", "GET /api/contests");
  const contests = (await (await fetch(`${API}/api/contests`)).json()) as Array<{
    key: string; objective: string; invariantCount: number; stakeAmount: number; poolRemaining: string;
  }>;
  for (const c of contests) {
    const poolUsdc = (BigInt(c.poolRemaining) / 1_000_000n).toString();
    console.log(`  ${c.key} | pool=${poolUsdc} USDC | stake=${c.stakeAmount / 1_000_000} USDC | invariant=${c.invariantCount}`);
  }
  const target = contests.find((c) => c.key === TARGET);
  if (!target) throw new Error(`target ${TARGET} not in list`);

  log("3/7 analyze", `GET /api/contests/${TARGET} — source + objective`);
  const detail = (await (await fetch(`${API}/api/contests/${TARGET}`)).json()) as { source: string; objective: string };
  console.log(`  objective: ${detail.objective}`);
  console.log(`  source: ${detail.source.split("\n").length} lines`);
  console.log(detail.source.split("\n").slice(0, 20).join("\n"));

  log("4/7 reason", "craft exploit calls");
  const exploitCalls = await reasonExploit(TARGET, detail.source, detail.objective);
  console.log(JSON.stringify(exploitCalls, null, 2));

  log("5/7 register", "POST /api/agents — server mints agent wallet (custody)");
  const label = `demo-agent-${Date.now().toString(36)}`;
  const agent = (await (await fetch(`${API}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label }),
  })).json()) as { id: string; label: string; walletAddress: string; erc8004TokenId: string };
  console.log(`  ${agent.label} → wallet ${agent.walletAddress}`);

  // On-chain calls are signed by the agent's wallet (skill.md rule): rewrite
  // every caller to the minted wallet. Time-window's beneficiary/verifier
  // calls still pass when set explicitly.
  const signedCalls = exploitCalls.map((c) => ({ ...c, caller: agent.walletAddress }));
  log("note", "callers rewritten to agent wallet (onchain calls are signed by it)");

  log("6/7 verify", "POST playground (free, anvil)");
  const pg = await (await fetch(`${API}/api/contests/${TARGET}/playground`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ exploitCalls: signedCalls }),
  })).json() as { verdict: string };
  console.log(`  playground verdict: ${pg.verdict}`);
  if (pg.verdict !== "VALID") {
    console.log("  exploit did not break the invariant — aborting real submit.");
    return;
  }

  log("7/7 submit", "POST submit — real, 1 USDC stake via x402");
  console.log("  (onchain: deploy fresh target → replay calls → invariant check → settle)");
  const res = await fetch(`${API}/api/contests/${TARGET}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: agent.id, exploitCalls: signedCalls }),
  });
  const body = await res.json().catch(() => ({})) as Record<string, string>;
  if (!res.ok) {
    console.error(`  FAILED (${res.status}): ${body.error ?? JSON.stringify(body)}`);
    process.exit(1);
  }
  console.log(`  verdict: ${body.verdict}`);
  console.log(`  exploit tx: ${body.exploitTxHash}`);
  console.log(`  settlement: ${body.settlementTxHash}`);
  console.log(`  reputation: ${body.reputationTxHash}`);
  console.log(`  view: https://hashscan.io/testnet/transaction/${body.settlementTxHash}`);
  console.log("\nDONE — agent got paid on proof, not promises.");
}

/** Let a real LLM write the exploit; fall back to the verified one. */
async function reasonExploit(
  targetKey: string,
  source: string,
  objective: string
): Promise<Array<{ caller: string; entryPoint: string; args: Record<string, unknown> }>> {
  const key = process.env.LLM_API_KEY;
  const base = process.env.LLM_BASE_URL ?? "https://api.anthropic.com/v1";
  const model = process.env.LLM_MODEL ?? "claude-sonnet-4-20250514";
  if (!key) {
    console.log("  (no LLM_API_KEY — using verified single-wallet exploit)");
    return [
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "deposit", args: {} },
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "donate", args: { amount: 1_000_000 } },
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "deposit", args: {} },
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "transferShares", args: { to: "0xa11ce00000000000000000000000000000000000", shareCount: 100 } },
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "transferShares", args: { to: "0xa11ce00000000000000000000000000000000000", shareCount: 200 } },
      { caller: "0xa11ce00000000000000000000000000000000000", entryPoint: "withdraw", args: { shareCount: 700 } },
    ];
  }
  console.log(`  (LLM reasoning via ${model})`);
  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system:
        "You are an elite smart-contract auditor agent. Return ONLY valid JSON — an array of exploit calls " +
        "[{caller, entryPoint, args}] — that makes the target's invariantHolds() return false. " +
        "All callers must be a single wallet 0xa11ce00000000000000000000000000000000000.",
      messages: [
        {
          role: "user",
          content: `Target: ${targetKey}\nObjective: ${objective}\n\nContract source:\n${source}`,
        },
      ],
    }),
  });
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.map((b) => b.text ?? "").join("") ?? "";
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  return JSON.parse(json) as Array<{ caller: string; entryPoint: string; args: Record<string, unknown> }>;
}

main().catch((e) => {
  console.error("\nagent-demo failed:", (e as Error).message);
  process.exit(1);
});
