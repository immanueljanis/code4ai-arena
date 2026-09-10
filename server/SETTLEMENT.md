# Settlement profiles

The server defaults to `SETTLEMENT_PROFILE=usdc`, using the existing
`HEDERA_USDC_TESTNET_ADDRESS` and `HEDERA_USDC_TESTNET_ID` configuration.

`SETTLEMENT_PROFILE=demo-hts` selects a custom six-decimal HTS test token called
DemoUSD. Supply `DEMO_HTS_TOKEN_ID` and explicitly configure
`X402_FACILITATOR_URL` and `X402_FACILITATOR_ACCOUNT_ID` for its facilitator.
The facade address is derived from the token ID; optional
`DEMO_HTS_TOKEN_ADDRESS` must match that address.

DemoUSD is a test token, not Circle-issued USDC or a dollar-backed asset.
The custom profile is restricted to Hedera testnet. A runtime network preflight
must verify RPC chain ID 296 before sending transactions.

Use an Arena deployed for the selected token and isolated deployment/database
state. Arena's token is immutable, so changing configuration does not change
the token held by an existing Arena. Verify token metadata, association, balances
and receipt success before treating a deployment as ready.

The profile configuration is the first implementation slice. Token provisioning,
self-hosted facilitator, complete gateway/display integration and live recovery
acceptance must be completed before using the custom profile end-to-end.
