import { Hono } from "hono";
import { readFileSync } from "node:fs";
import path from "node:path";

export const skill = new Hono();

const skillMd = readFileSync(path.join(import.meta.dir, "..", "..", "skill.md"), "utf8");

/** Agent-facing onboarding doc — served raw so any agent can `curl` and read it. */
skill.get("/skill.md", (c) =>
  c.text(skillMd, 200, { "Content-Type": "text/markdown; charset=utf-8" })
);
