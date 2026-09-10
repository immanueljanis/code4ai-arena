import { SQL } from "bun";
import { loadFacilitatorConfig } from "./config.ts";
import { initSettlementSchema, postgresSettlementPermissions } from "./permissions.ts";
import { createFacilitatorService } from "./service.ts";
import { hederaFacilitatorSigner } from "./signer.ts";

export { loadFacilitatorConfig } from "./config.ts";
export { initSettlementSchema, postgresSettlementPermissions } from "./permissions.ts";
export { createFacilitatorService } from "./service.ts";
export { hederaFacilitatorSigner } from "./signer.ts";
export { paymentDigest, PaymentValidationError, validateArenaPayment } from "./validator.ts";
export type {
  ArenaTransferPolicy,
  DurableSettlementPermissions,
  ExactAuthorization,
  ExactRequirements,
  FacilitatorSigner,
  SettlementReservation,
} from "./types.ts";

if (import.meta.main) {
  const config = loadFacilitatorConfig(process.env);
  const sql = new SQL(config.databaseUrl);
  await initSettlementSchema(sql);
  const app = createFacilitatorService({
    policy: config.policy,
    signer: hederaFacilitatorSigner(config),
    permissions: postgresSettlementPermissions(sql),
    settlementSecret: config.settlementSecret,
  });
  Bun.serve({ port: config.port, fetch: app.fetch });
  console.log(
    JSON.stringify({
      event: "facilitator-listening",
      port: config.port,
      network: config.network,
      feePayer: config.feePayerAccountId,
      token: config.policy.tokenId,
      arena: config.policy.arenaAccountId,
      stakeAmount: config.policy.stakeAmount,
    })
  );
}
