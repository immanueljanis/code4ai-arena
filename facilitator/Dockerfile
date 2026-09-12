FROM oven/bun:1 AS runtime

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/

# Gas only: the facilitator pays the fee for stake transfers and never holds
# the settlement token, so it needs no association.
ENV PORT=4020

EXPOSE 4020
CMD ["bun", "run", "src/index.ts"]
