# @tieout/contracts

Foundry project for Tieout's onchain anchor.

_In plain terms: `AttestationRegistry` is a tiny public notary. It records that
a report fingerprint existed at a moment in time — nothing more. It never
vouches for correctness or identity._

Two MVP contracts, both built and tested with `forge` (not the Node workspace
toolchain):

- **`AttestationRegistry`** (Batch 3) — a thin, identity-free anchor.
  `attest(bytes32 reportHash)` records `{uint64 blockNumber, uint64 timestamp}`
  **first-write-wins**, emits `Attested` on the first write only, and treats a
  repeat attest as an **idempotent no-op success** (never overwritten, never
  reverting — so a front-runner cannot block the author). Permissionless:
  anyone may attest; `submitter` is a recorded fact, **not** a signature. The
  anchor proves a `reportHash` existed at/after a block — **never** correctness
  or author identity (AD-14/AD-16). Readable in one `eth_call` via the public
  `attestations` getter.
- **`MockStakedVault`** (Batch 2) — an ERC-4626-shaped rate surface,
  **TEST-ONLY — never deployed to hold value** (AD-15). Used only by the AD-6
  rate cross-check; it is **not** part of the deploy ladder below.

## Build & test

Requires Foundry **v1.7.1** on `PATH`. From this directory (so `.gas-snapshot`
resolves at cwd, not `--root`):

```sh
forge build            # pinned solc 0.8.35, evm_version cancun
forge test             # unit + fuzz under the pinned [fuzz] seed
forge fmt --check
forge snapshot --check # gas-drift gate
```

`foundry.toml` pins the toolchain for reproducibility under NFR-0:

- `solc = "0.8.35"` and `auto_detect_solc = false` — the compiler cannot drift.
- `evm_version = "cancun"` — pinned rather than inheriting Foundry's newest
  default (`Osaka`).
- `bytecode_hash = "none"` — bytecode is a pure function of source + settings.
- `[fuzz]` with an explicit `runs` and a **pinned `seed`** — random-per-run
  fuzzing is at odds with NFR-0.

CI installs Foundry v1.7.1 via the `foundry-toolchain` action and runs
`forge build` + `forge fmt --check` + `forge test` + `forge snapshot --check`.
There is **no deploy step in CI** — deploys are manual and approval-gated.

## Deploy ladder (`AttestationRegistry` only)

`script/DeployAttestationRegistry.s.sol` deploys **only** `AttestationRegistry`
(no constructor args). It never references `MockStakedVault` (AD-15). The ladder
climbs one rung at a time, and **every non-local rung pauses for explicit
approval** before it broadcasts:

1. **Local Anvil** — nothing leaves the machine:

   ```sh
   anvil &
   forge script script/DeployAttestationRegistry.s.sol:DeployAttestationRegistry \
     --rpc-url http://127.0.0.1:8545 --broadcast \
     --private-key <anvil-dev-key>
   ```

2. **Base Sepolia (84532)** rehearsal — **HALT for approval**, then broadcast +
   verify on the Etherscan verifier (see below).
3. **Base mainnet (8453)** single canonical anchor — **HALT for approval**.

`forge script` is **simulation-by-default**; only `--broadcast` sends, and
`--verify` / `--resume` also imply broadcast intent. Broadcasting requires a
real signer — prefer a keystore account (`--account tieout-deployer`) over a raw
`--private-key`.

**Verify on Basescan explicitly — not Sourcify.** After each non-local deploy,
verify against the **Etherscan verifier**, passing the key explicitly and using
the chain that matches the rung you just deployed — `base-sepolia` for the
rehearsal, `base` for the canonical anchor:

```sh
# Refuse to verify with an empty key: an empty --etherscan-api-key silently
# falls back to Sourcify, and an unverified anchor is indistinguishable from a scam.
[ -n "$ETHERSCAN_API_KEY" ] || { echo "ETHERSCAN_API_KEY unset — aborting verify"; exit 1; }

# Base Sepolia rehearsal (84532):
forge verify-contract <addr> AttestationRegistry \
  --chain base-sepolia --verifier etherscan \
  --etherscan-api-key "$ETHERSCAN_API_KEY" --watch

# Base mainnet canonical anchor (8453):
forge verify-contract <addr> AttestationRegistry \
  --chain base --verifier etherscan \
  --etherscan-api-key "$ETHERSCAN_API_KEY" --watch
```

Without the Etherscan verifier + key, `forge verify-contract` silently falls
back to Sourcify. The key must cover **both** chains — an Etherscan-V2
multichain key does; a Base-only Basescan key will fail the Sepolia rung.
`foundry.toml`'s `[rpc_endpoints]` / `[etherscan]` aliases (`base`,
`base_sepolia`) and `.env.example` document the required `${VAR}` secrets; none
are committed.

## Deployments

The canonical anchor address is the forward hook `apps/web` (Batch 5) and any
report footer will reference. The non-local rungs are **maintainer actions
executed at/near the terminal release**, each gated on explicit approval, a
funded deployer, and a Basescan/Etherscan-V2 key.

| Network             | Chain ID | Address                                    | Status                                   |
| ------------------- | -------- | ------------------------------------------ | ---------------------------------------- |
| Anvil (local)       | 31337    | _ephemeral per run_                        | ✅ deploy + attest proven locally         |
| Base Sepolia        | 84532    | _to be recorded on the rehearsal deploy_   | ⏸ pending maintainer approval            |
| Base mainnet        | 8453     | _to be recorded on the canonical anchor_   | ⏸ pending maintainer approval            |

_Update the Base Sepolia / Base mainnet rows with the deployed address + the
Basescan verification URL once each approval-gated rung is broadcast._
