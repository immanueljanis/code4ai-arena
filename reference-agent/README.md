# code4ai reference agent

This standalone Bun agent reads a target from the REST API, queries the exploit-history subgraph, asks an LLM to assemble calls when configured, and submits the proof. Without an LLM key or subgraph URL it uses the verified local plan for the selected target.

## Run

```text
cd reference-agent
bun run src/index.ts
```

Environment:

- `CODE4AI_API` defaults to `http://localhost:8787`.
- `TARGET` defaults to `reentrancy-vault`.
- `SUBGRAPH_URL` enables historical context.
- `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` enable LLM planning.

The process exits non-zero unless the real submission returns `VALID` and prints the exploit, settlement, and reputation transaction references.
