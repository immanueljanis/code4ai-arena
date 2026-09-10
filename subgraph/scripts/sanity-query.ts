const endpoint = process.env.SUBGRAPH_URL;

if (!endpoint) {
  throw new Error("SUBGRAPH_URL is required");
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: `query ExploitHistory { historicalExploits(first: 10, orderBy: timestamp, orderDirection: desc) { id targetKey incident attackTx } }`,
  }),
});

if (!response.ok) {
  throw new Error(`Graph request failed with ${response.status}`);
}

const body = await response.json() as {
  data?: { historicalExploits?: Array<{ targetKey: string; incident: string; attackTx: string }> };
  errors?: Array<{ message: string }>;
};

if (body.errors?.length) {
  throw new Error(body.errors.map((error) => error.message).join("; "));
}

const entries = body.data?.historicalExploits ?? [];
const expected = new Set(["access-control-vault", "rounding-vault", "reentrancy-vault"]);
const found = new Set(entries.map((entry) => entry.targetKey));
if (![...expected].every((target) => found.has(target))) {
  throw new Error(`missing target entries: ${[...expected].filter((target) => !found.has(target)).join(", ")}`);
}

console.log(JSON.stringify(entries, null, 2));
