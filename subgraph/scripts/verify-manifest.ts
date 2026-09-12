import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Catch the manifest errors that only surface once The Graph is already
 * indexing: an event signature that no longer matches the ABI, a handler that
 * was renamed, or a data source left unbounded so it scans to chain head.
 */
const ROOT = path.resolve(import.meta.dir, "..");

interface Problem {
  dataSource: string;
  issue: string;
}

export function verifyManifest(root: string = ROOT): Problem[] {
  const manifest = readFileSync(path.join(root, "subgraph.yaml"), "utf8");
  const mapping = readFileSync(path.join(root, "src", "mapping.ts"), "utf8");
  const blocks = manifest.split(/\n {2}- kind: ethereum\n/).slice(1);
  const problems: Problem[] = [];

  if (blocks.length === 0) problems.push({ dataSource: "(manifest)", issue: "no data sources" });

  for (const block of blocks) {
    const name = block.match(/name: (\w+)/)?.[1] ?? "(unnamed)";
    const abiName = block.match(/abi: (\w+)/)?.[1];
    const signature = block.match(/- event: ([^\n]+)/)?.[1]?.trim();
    const handler = block.match(/handler: (\w+)/)?.[1];
    const startBlock = Number(block.match(/startBlock: (\d+)/)?.[1] ?? NaN);
    const endBlock = Number(block.match(/endBlock: (\d+)/)?.[1] ?? NaN);

    if (!abiName || !signature || !handler) {
      problems.push({ dataSource: name, issue: "missing abi, event or handler" });
      continue;
    }

    const raw = JSON.parse(readFileSync(path.join(root, "abis", `${abiName}.json`), "utf8")) as
      | unknown[]
      | { abi: unknown[] };
    const abi = (Array.isArray(raw) ? raw : raw.abi) as Array<{
      type: string;
      name: string;
      inputs: Array<{ type: string; indexed?: boolean }>;
    }>;
    const declared = abi
      .filter((entry) => entry.type === "event")
      .map(
        (entry) =>
          `${entry.name}(${entry.inputs
            .map((input) => `${input.indexed ? "indexed " : ""}${input.type}`)
            .join(",")})`
      );

    if (!declared.includes(signature)) {
      problems.push({
        dataSource: name,
        issue: `event ${signature} is not in ${abiName}.json (has ${declared.join(" | ")})`,
      });
    }
    if (!mapping.includes(`export function ${handler}`)) {
      problems.push({ dataSource: name, issue: `handler ${handler} is not exported from mapping.ts` });
    }
    // Each exploit lives in one block; an unbounded source scans to chain head.
    if (!Number.isInteger(startBlock) || startBlock <= 0) {
      problems.push({ dataSource: name, issue: "startBlock is missing or not positive" });
    } else if (endBlock !== startBlock) {
      problems.push({
        dataSource: name,
        issue: `endBlock ${endBlock} should pin the same block as startBlock ${startBlock}`,
      });
    }
  }

  return problems;
}

if (import.meta.main) {
  const problems = verifyManifest();
  for (const problem of problems) {
    console.error(`${problem.dataSource}: ${problem.issue}`);
  }
  console.log(
    JSON.stringify({ event: "subgraph-manifest", problems: problems.length })
  );
  if (problems.length) process.exit(1);
}
