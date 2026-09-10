const API = process.env.CODE4AI_API ?? "http://localhost:8787";
const TARGET = "access-control-vault";

type Agent = {
  id: string;
  walletAddress: `0x${string}`;
};

type SubmitResult = {
  verdict: "VALID" | "INVALID";
  exploitTxHash: string;
  settlementTxHash: string;
  reputationTxHash: string;
};

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function register(label: string): Promise<Agent> {
  return request<Agent>("/api/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

function isTransactionReference(value: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(value) || /^0\.0\.\d+@\d+\.\d+$/.test(value);
}

function assertSettlement(result: SubmitResult, expectedVerdict: SubmitResult["verdict"]): void {
  if (result.verdict !== expectedVerdict) {
    throw new Error(`expected ${expectedVerdict}, received ${result.verdict}`);
  }
  if (!isTransactionReference(result.settlementTxHash)) {
    throw new Error(`invalid settlement transaction reference: ${result.settlementTxHash}`);
  }
  if (!isTransactionReference(result.exploitTxHash)) {
    throw new Error(`invalid exploit transaction reference: ${result.exploitTxHash}`);
  }
}

async function submit(agentId: string, exploitCalls: unknown[]): Promise<SubmitResult> {
  return request<SubmitResult>(`/api/contests/${TARGET}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId, exploitCalls }),
  });
}

async function main(): Promise<void> {
  const validAgent = await register(`hedera-smoke-valid-${Date.now().toString(36)}`);
  const valid = await submit(validAgent.id, [
    {
      caller: validAgent.walletAddress,
      entryPoint: "setOwner",
      args: { newOwner: validAgent.walletAddress },
    },
    {
      caller: validAgent.walletAddress,
      entryPoint: "withdrawAll",
      args: {},
    },
  ]);
  assertSettlement(valid, "VALID");
  console.log(JSON.stringify({ case: "VALID", ...valid }, null, 2));

  const invalidAgent = await register(`hedera-smoke-invalid-${Date.now().toString(36)}`);
  const invalid = await submit(invalidAgent.id, []);
  assertSettlement(invalid, "INVALID");
  console.log(JSON.stringify({ case: "INVALID", ...invalid }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
