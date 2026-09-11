const endpoint = process.env.SUBGRAPH_URL;

if (!endpoint) {
  throw new Error("SUBGRAPH_URL is required");
}

interface Exploit {
  id: string;
  targetKey: string;
  incident: string;
  technique: string;
  lossUsd: string;
  chain: string;
  blockNumber: string;
  timestamp: string;
  attackTx: string;
  attacker: string;
  victim: string;
  sourceUrl: string;
}

const EXPECTED: Record<string, { incident: string; blockNumber: string }> = {
  "access-control-vault": { incident: "Poly Network", blockNumber: "12996659" },
  "rounding-vault": { incident: "Resupply Finance", blockNumber: "22785461" },
  "reentrancy-vault": { incident: "The DAO", blockNumber: "1718497" },
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: `query ExploitHistory {
      historicalExploits(first: 100, orderBy: timestamp, orderDirection: desc) {
        id targetKey incident technique lossUsd chain blockNumber timestamp
        attackTx attacker victim sourceUrl
      }
    }`,
  }),
});

if (!response.ok) {
  throw new Error(`Graph request failed with ${response.status}`);
}

const body = (await response.json()) as {
  data?: { historicalExploits?: Exploit[] };
  errors?: Array<{ message: string }>;
};

if (body.errors?.length) {
  throw new Error(body.errors.map((error) => error.message).join("; "));
}

const entries = body.data?.historicalExploits ?? [];
const problems: string[] = [];

for (const [targetKey, expected] of Object.entries(EXPECTED)) {
  const matches = entries.filter((entry) => entry.targetKey === targetKey);
  if (matches.length === 0) {
    problems.push(`${targetKey}: missing`);
    continue;
  }
  // The entity is immutable and keyed by the attack transaction, so an attack
  // that emits the watched event many times must still produce exactly one row.
  if (matches.length > 1) {
    problems.push(`${targetKey}: ${matches.length} entries, expected exactly 1`);
    continue;
  }
  const entry = matches[0];
  if (entry.incident !== expected.incident) {
    problems.push(`${targetKey}: incident ${entry.incident} != ${expected.incident}`);
  }
  if (entry.blockNumber !== expected.blockNumber) {
    problems.push(`${targetKey}: block ${entry.blockNumber} != ${expected.blockNumber}`);
  }
  if (entry.chain !== "ethereum-mainnet") {
    problems.push(`${targetKey}: chain ${entry.chain}`);
  }
  if (!/^0x[0-9a-f]{64}$/.test(entry.attackTx)) {
    problems.push(`${targetKey}: attackTx is not a transaction hash`);
  }
  if (entry.id !== entry.attackTx) {
    problems.push(`${targetKey}: id ${entry.id} is not the attack transaction`);
  }
  for (const field of ["technique", "lossUsd", "sourceUrl", "attacker", "victim"] as const) {
    if (!entry[field]) problems.push(`${targetKey}: ${field} is empty`);
  }
}

if (problems.length) {
  throw new Error(`subgraph sanity failed:\n  ${problems.join("\n  ")}`);
}

console.log(
  JSON.stringify(
    {
      event: "subgraph-sanity-ok",
      endpoint: new URL(endpoint).origin,
      exploits: entries.length,
      targets: entries.map((entry) => entry.targetKey).sort(),
    },
    null,
    2
  )
);
