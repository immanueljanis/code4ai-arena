import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { proto } from "@hiero-ledger/proto";
import { PaymentValidationError, paymentDigest, validateArenaPayment } from "../src/validator.ts";
import type { ExactAuthorization, ExactRequirements } from "../src/types.ts";
import {
  EXPECTED_TRANSACTION_ID,
  NOW,
  VALID_START_SECONDS,
  account,
  arenaBody,
  authorization,
  encodeBodies,
  encodeSignedBodies,
  payment,
  signaturePairs,
  paymentFromTransaction,
  policy,
  requirements,
  token,
  type Body,
  type PaymentRequest,
} from "./helpers.ts";

const tokenList = (body: Body) => body.cryptoTransfer.tokenTransfers[0];
const entries = (body: Body) => tokenList(body).transfers;

function validate(request: PaymentRequest) {
  return validateArenaPayment(request.paymentPayload, request.paymentRequirements, policy, NOW);
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof PaymentValidationError) return error.code;
    throw error;
  }
  throw new Error("expected a PaymentValidationError but the payment was accepted");
}

function rejection(mutate: (body: Body) => void): string {
  return codeOf(() => validate(payment(mutate)));
}

describe("validateArenaPayment happy path", () => {
  test("accepts a policy conformant stake transfer", () => {
    const result = validate(payment());
    expect(result.payer).toBe(policy.registeredAgentAccountId);
    expect(result.transactionId).toBe(EXPECTED_TRANSACTION_ID);
  });

  test("returns the sha256 digest of the decoded transaction bytes", () => {
    const request = payment();
    const encoded = request.paymentPayload.payload.transaction;
    const expected = `sha256:${createHash("sha256").update(Buffer.from(encoded, "base64")).digest("hex")}`;
    expect(validate(request).paymentDigest).toBe(expected);
    expect(paymentDigest(encoded)).toBe(expected);
  });

  test("returns the same digest for the same transaction across calls", () => {
    const request = payment();
    expect(validate(request).paymentDigest).toBe(validate(request).paymentDigest);
  });

  test("echoes back the canonical transaction it validated", () => {
    const request = payment();
    expect(validate(request).transaction).toBe(request.paymentPayload.payload.transaction);
  });
});

describe("token and transfer policy", () => {
  test("rejects a different token id", () => {
    expect(rejection((body) => {
      tokenList(body).token = token(6666);
    })).toBe("token_mismatch");
  });

  test("rejects a credit to an account other than the arena", () => {
    expect(rejection((body) => {
      entries(body)[1].accountID = account(3003);
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects a debit from an account other than the registered agent", () => {
    expect(rejection((body) => {
      entries(body)[0].accountID = account(4004);
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects a stake larger than the policy stake", () => {
    expect(rejection((body) => {
      entries(body)[0].amount = -200;
      entries(body)[1].amount = 200;
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects a stake smaller than the policy stake", () => {
    expect(rejection((body) => {
      entries(body)[0].amount = -1;
      entries(body)[1].amount = 1;
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects an unbalanced transfer pair", () => {
    expect(rejection((body) => {
      entries(body)[1].amount = 100000;
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects a reversed sign that would pay the agent from the arena", () => {
    expect(rejection((body) => {
      entries(body)[0].amount = 100;
      entries(body)[1].amount = -100;
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects a third transfer entry", () => {
    expect(rejection((body) => {
      entries(body).push({ accountID: account(7007), amount: 5 });
    })).toBe("token_transfer_entry_count");
  });

  test("rejects a zero amount transfer entry", () => {
    expect(rejection((body) => {
      entries(body)[1].amount = 0;
    })).toBe("invalid_token_transfer_entries");
  });

  test("rejects two accounts debiting the same token", () => {
    expect(rejection((body) => {
      entries(body)[1] = { accountID: account(4004), amount: -100 };
    })).toBe("stake_transfer_mismatch");
  });

  test("rejects a split stake funded by two payers", () => {
    expect(rejection((body) => {
      entries(body)[0].amount = -50;
      entries(body).splice(1, 0, { accountID: account(4004), amount: -50 });
    })).toBe("token_transfer_entry_count");
  });

  test("rejects duplicate entries for one account", () => {
    expect(rejection((body) => {
      entries(body)[1].accountID = account(1001);
    })).toBe("invalid_token_transfer_entries");
  });

  test("rejects an nft transfer inside the stake token list", () => {
    expect(rejection((body) => {
      tokenList(body).nftTransfers = [
        { senderAccountID: account(1001), receiverAccountID: account(2002), serialNumber: 1 },
      ];
    })).toBe("nft_transfer_not_allowed");
  });

  test("rejects a second token transfer list carrying a facilitator nft debit", () => {
    expect(rejection((body) => {
      body.cryptoTransfer.tokenTransfers.push({
        token: token(9999),
        nftTransfers: [{ senderAccountID: account(800), receiverAccountID: account(4004), serialNumber: 7 }],
      });
    })).toBe("token_transfer_list_mismatch");
  });

  test("rejects an approved allowance debit", () => {
    expect(rejection((body) => {
      entries(body)[0].isApproval = true;
    })).toBe("allowance_or_hook_not_allowed");
  });

  test("rejects an approved allowance credit", () => {
    expect(rejection((body) => {
      entries(body)[1].isApproval = true;
    })).toBe("allowance_or_hook_not_allowed");
  });

  test("rejects any hbar transfer riding along", () => {
    expect(rejection((body) => {
      body.cryptoTransfer.transfers = {
        accountAmounts: [
          { accountID: account(800), amount: -5 },
          { accountID: account(4004), amount: 5 },
        ],
      };
    })).toBe("unexpected_hbar_transfer");
  });

  test("rejects an explicit expectedDecimals hint", () => {
    expect(rejection((body) => {
      tokenList(body).expectedDecimals = { value: 2 };
    })).toBe("expected_decimals_not_allowed");
  });

  test("rejects an empty token transfer list", () => {
    expect(rejection((body) => {
      body.cryptoTransfer.tokenTransfers = [];
    })).toBe("token_transfer_list_mismatch");
  });
});

describe("fee and lifetime policy", () => {
  test("rejects a transaction fee above the policy ceiling", () => {
    expect(rejection((body) => {
      body.transactionFee = 200000001;
    })).toBe("transaction_fee_out_of_bounds");
  });

  test("accepts a transaction fee exactly at the policy ceiling", () => {
    const result = validate(payment((body) => {
      body.transactionFee = 200000000;
    }));
    expect(result.payer).toBe(policy.registeredAgentAccountId);
  });

  test("rejects a missing transaction fee", () => {
    expect(rejection((body) => {
      delete body.transactionFee;
    })).toBe("transaction_fee_out_of_bounds");
  });

  test("rejects a transaction whose window already closed", () => {
    expect(rejection((body) => {
      body.transactionID.transactionValidStart.seconds = VALID_START_SECONDS - 1000;
    })).toBe("invalid_transaction_lifetime");
  });

  test("rejects a transaction with less than the minimum remaining lifetime", () => {
    expect(rejection((body) => {
      body.transactionID.transactionValidStart.seconds = VALID_START_SECONDS - 25;
      body.transactionValidDuration = { seconds: 30 };
    })).toBe("invalid_transaction_lifetime");
  });

  test("rejects a valid start too far in the future", () => {
    expect(rejection((body) => {
      body.transactionID.transactionValidStart.seconds = VALID_START_SECONDS + 16;
    })).toBe("invalid_transaction_lifetime");
  });

  test("accepts a valid start at the future boundary", () => {
    const result = validate(payment((body) => {
      body.transactionID.transactionValidStart.seconds = VALID_START_SECONDS + 15;
    }));
    expect(result.payer).toBe(policy.registeredAgentAccountId);
  });

  test("rejects a duration below the policy minimum", () => {
    expect(rejection((body) => {
      body.transactionValidDuration = { seconds: 29 };
    })).toBe("invalid_transaction_duration");
  });

  test("rejects a duration above the policy maximum", () => {
    expect(rejection((body) => {
      body.transactionValidDuration = { seconds: 181 };
    })).toBe("invalid_transaction_duration");
  });

  test("rejects a missing transaction duration", () => {
    expect(rejection((body) => {
      delete body.transactionValidDuration;
    })).toBe("missing_transaction_duration");
  });
});

describe("identity policy", () => {
  test("rejects a fee payer that is not the facilitator", () => {
    expect(rejection((body) => {
      body.transactionID.accountID = account(1001);
    })).toBe("fee_payer_mismatch");
  });

  test("rejects a node account outside the allow list", () => {
    expect(rejection((body) => {
      body.nodeAccountID = account(9);
    })).toBe("node_account_not_allowed");
  });

  test("accepts the second allowed node account", () => {
    const result = validate(payment((body) => {
      body.nodeAccountID = account(4);
    }));
    expect(result.transactionId).toBe(EXPECTED_TRANSACTION_ID);
  });

  test("rejects a scheduled transaction id", () => {
    expect(rejection((body) => {
      body.transactionID.scheduled = true;
    })).toBe("invalid_transaction_id");
  });

  test("rejects a nonzero transaction id nonce", () => {
    expect(rejection((body) => {
      body.transactionID.nonce = 4;
    })).toBe("invalid_transaction_id");
  });

  test("rejects a missing transaction id", () => {
    expect(rejection((body) => {
      delete body.transactionID;
    })).toBe("missing_transaction_id");
  });
});

describe("transaction body shape", () => {
  test("rejects a body that carries no crypto transfer", () => {
    expect(rejection((body) => {
      delete body.cryptoTransfer;
    })).toBe("unexpected_transaction_type");
  });

  test("rejects a body that carries a different transaction type", () => {
    expect(rejection((body) => {
      delete body.cryptoTransfer;
      body.tokenBurn = { token: token(5555), amount: 100 };
    })).toBe("unsupported_transaction_field");
  });

  test("rejects a crypto transfer body with an extra top level field", () => {
    expect(rejection((body) => {
      body.memo = "settle me";
    })).toBe("unsupported_transaction_field");
  });
});

describe("transaction encoding", () => {
  test("rejects a non base64 transaction", () => {
    expect(codeOf(() => validate(paymentFromTransaction("not base64!!")))).toBe("invalid_transaction_encoding");
  });

  test("rejects an empty transaction string", () => {
    expect(codeOf(() => validate(paymentFromTransaction("")))).toBe("invalid_transaction_encoding");
  });

  test("rejects base64 whose length is not a multiple of four", () => {
    expect(codeOf(() => validate(paymentFromTransaction("QUJDR")))).toBe("invalid_transaction_encoding");
  });

  test("rejects base64 that does not decode as a transaction list", () => {
    const encoded = Buffer.from("hello world").toString("base64");
    expect(codeOf(() => validate(paymentFromTransaction(encoded)))).toBe("invalid_transaction_encoding");
  });

  test("rejects a transaction list entry with no signed transaction bytes", () => {
    const bytes = proto.TransactionList.encode({ transactionList: [{ sigMap: {} }] }).finish();
    const encoded = Buffer.from(bytes).toString("base64");
    expect(codeOf(() => validate(paymentFromTransaction(encoded)))).toBe("missing_signed_transaction");
  });
});

describe("payment requirements agreement", () => {
  function withRequirements(
    accepted: Partial<ExactRequirements> | null,
    declared: Partial<ExactRequirements> | null
  ): PaymentRequest {
    const transaction = payment().paymentPayload.payload.transaction;
    return {
      paymentPayload: authorization(transaction, requirements(accepted ?? {})),
      paymentRequirements: requirements(declared ?? {}),
    };
  }

  const fields: Array<[string, Partial<ExactRequirements>]> = [
    ["amount", { amount: "1" }],
    ["asset", { asset: "0.0.9999" }],
    ["payTo", { payTo: "0.0.4004" }],
    ["network", { network: "hedera:mainnet" }],
    ["maxTimeoutSeconds", { maxTimeoutSeconds: 3600 }],
    ["scheme", { scheme: "upto" as ExactRequirements["scheme"] }],
    ["extra.feePayer", { extra: { feePayer: "0.0.4004" } }],
  ];

  for (const [field, override] of fields) {
    test(`rejects accepted requirements disagreeing on ${field}`, () => {
      expect(codeOf(() => validate(withRequirements(override, null)))).toBe("payment_requirements_mismatch");
    });

    test(`rejects payment requirements disagreeing on ${field}`, () => {
      expect(codeOf(() => validate(withRequirements(null, override)))).toBe("payment_requirements_mismatch");
    });
  }

  test("rejects an unsupported x402 version", () => {
    const request = payment();
    const payload = { ...request.paymentPayload, x402Version: 1 } as unknown as ExactAuthorization;
    expect(codeOf(() => validateArenaPayment(payload, request.paymentRequirements, policy, NOW))).toBe(
      "invalid_payment_payload"
    );
  });

  test("rejects a payload with no accepted requirements", () => {
    const request = payment();
    const payload = { ...request.paymentPayload, accepted: undefined } as unknown as ExactAuthorization;
    expect(codeOf(() => validateArenaPayment(payload, request.paymentRequirements, policy, NOW))).toBe(
      "invalid_payment_payload"
    );
  });
});

describe("multi node transaction lists", () => {
  test("accepts consistent bodies for two allowed nodes", () => {
    const transaction = encodeBodies([arenaBody(3), arenaBody(4)]);
    const result = validate(paymentFromTransaction(transaction));
    expect(result.transactionId).toBe(EXPECTED_TRANSACTION_ID);
    expect(result.payer).toBe(policy.registeredAgentAccountId);
  });

  test("rejects the same node account listed twice", () => {
    const transaction = encodeBodies([arenaBody(3), arenaBody(3)]);
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("inconsistent_node_transactions");
  });

  test("rejects more bodies than allowed node accounts", () => {
    const transaction = encodeBodies([arenaBody(3), arenaBody(4), arenaBody(3)]);
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("too_many_node_transactions");
  });

  test("rejects bodies whose transaction ids differ", () => {
    const second = arenaBody(4);
    second.transactionID.transactionValidStart.nanos = 456;
    const transaction = encodeBodies([arenaBody(3), second]);
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("inconsistent_node_transactions");
  });

  test("rejects bodies whose stake amounts differ", () => {
    const second = arenaBody(4);
    second.cryptoTransfer.tokenTransfers[0].transfers[0].amount = -200;
    second.cryptoTransfer.tokenTransfers[0].transfers[1].amount = 200;
    const transaction = encodeBodies([arenaBody(3), second]);
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("stake_transfer_mismatch");
  });

  test("rejects bodies whose transaction fees differ", () => {
    const second = arenaBody(4);
    second.transactionFee = 150000000;
    const transaction = encodeBodies([arenaBody(3), second]);
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("inconsistent_node_transactions");
  });
});

describe("signature map bounds", () => {
  test("accepts a partially signed transaction carrying the payer signature", () => {
    const transaction = encodeSignedBodies([arenaBody()], { sigMap: { sigPair: signaturePairs(1) } });
    expect(validate(paymentFromTransaction(transaction)).payer).toBe(policy.registeredAgentAccountId);
  });

  test("rejects more signature pairs than the facilitator will ever need", () => {
    const transaction = encodeSignedBodies([arenaBody()], { sigMap: { sigPair: signaturePairs(5) } });
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("signature_map_out_of_bounds");
  });

  test("rejects a signed transaction padded beyond the size the fee payer accepts", () => {
    const transaction = encodeSignedBodies([arenaBody()], {
      sigMap: { sigPair: signaturePairs(2, 3000) },
    });
    expect(codeOf(() => validate(paymentFromTransaction(transaction)))).toBe("signed_transaction_too_large");
  });
});
