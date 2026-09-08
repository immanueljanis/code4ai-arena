# ---- stage 1: compile contract artifacts with Foundry ----
FROM ghcr.io/foundry-rs/foundry:stable AS forge
WORKDIR /build
COPY --chown=foundry:foundry contracts/ ./contracts/
RUN cd contracts && forge build --skip test

# ---- stage 2: runtime ----
FROM oven/bun:1 AS runtime

# anvil is spawned at runtime by the playground verifier (verifier-local.ts)
COPY --from=forge /usr/local/bin/anvil /usr/local/bin/anvil

WORKDIR /app
COPY server/ ./server/
COPY contracts/src/ ./contracts/src/
COPY --from=forge /build/contracts/out/ ./contracts/out/

WORKDIR /app/server
RUN bun install --frozen-lockfile

ENV CONTRACTS_OUT_DIR=/app/contracts/out
ENV CONTRACTS_SRC_DIR=/app/contracts/src
ENV PORT=8787

EXPOSE 8787
CMD ["bun", "run", "src/index.ts"]
