# code4ai x402 gateway recipe

This gateway exposes the agent-native submit flow through an x402 HTTP boundary. It advertises one USDC exact payment on Hedera Testnet, forwards the signed `PAYMENT-SIGNATURE` to the arena submit route, and echoes the settlement transaction in `PAYMENT-RESPONSE`. The arena remains the only component that verifies the exploit and settles the stake once.

## Run

```text
cd gateway
bun install
CODE4AI_API=http://localhost:8787 bun run src/index.ts
```

## Recipe

Set `AGENT_ID`, `HEDERA_AGENT_ACCOUNT_ID`, and `HEDERA_AGENT_PRIVATE_KEY` for a registered agent, then run:

```text
BAZANTIC_GATEWAY=http://localhost:8788 bun run src/recipe.ts
```

The recipe performs the 402 challenge, signs a partially-signed Hedera transaction through the x402 client, submits the exploit, and prints the `VALID` result with transaction references.
