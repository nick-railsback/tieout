# @tieout/contracts

Foundry project for Tieout's onchain anchor. **Scaffold only in Batch 1** — no
Solidity sources yet.

- **Batch 2** adds `MockStakedVault` (ERC-4626, **TEST-ONLY — never deployed to
  hold value**), with an explicit rate-accrual event and `convertToAssets` using
  no OZ virtual offset (AD-15).
- **Batch 3** adds `AttestationRegistry` — first-write-wins `attest(bytes32)`,
  idempotent repeat, identity-free `submitter` (AD-14).

## Build

Requires Foundry **v1.7.1** on `PATH`. From the repo root:

```sh
pnpm contracts:build      # forge build --root packages/contracts
```

`foundry.toml` pins the toolchain for reproducibility under NFR-0:

- `solc = "0.8.35"` and `auto_detect_solc = false` — the compiler cannot drift.
- `evm_version = "cancun"` — pinned rather than inheriting Foundry's newest
  default (`Osaka`).
- `bytecode_hash = "none"` — bytecode is a pure function of source + settings.
- `[fuzz]` with an explicit `runs` and a **pinned `seed`** — random-per-run
  fuzzing is at odds with NFR-0; the seed is staged now for Batches 2-3.

CI installs Foundry v1.7.1 via the `foundry-toolchain` action and runs
`forge build` + `forge fmt --check`; no push happens until the terminal release
batch.
