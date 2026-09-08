import { Hono } from "hono";
import { readFileSync } from "node:fs";
import path from "node:path";

export const llms = new Hono();

const llmsTxt = readFileSync(path.join(import.meta.dir, "..", "..", "llms.txt"), "utf8");

/** Machine-readable platform index (llmstxt.org convention). */
llms.get("/llms.txt", (c) =>
  c.text(llmsTxt, 200, { "Content-Type": "text/plain; charset=utf-8" })
);
