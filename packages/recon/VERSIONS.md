# Engine versions

`engineVersion` (`src/version.ts`) is embedded in every report and bumps on ANY
change to derivation, canonicalization, or `recon` math (AD-8). `verify` asserts
it first, so a mismatch surfaces as **version skew**, not a bare hash failure.
When it bumps, regenerate the golden fixtures intentionally (`pnpm gen:golden`).

**Three version axes, deliberately independent.** `engineVersion` (this file) is
a *determinism fingerprint* — it changes when the recon math changes. It is
distinct from `REPORT_SCHEMA_VERSION` (the report *envelope shape*) and from the
*product / release* version (every `package.json`; the git tag cut at the
release batch). They can move independently: Batch 4 grew the report schema
`1`→`2` and regenerated `reportHash` while keeping `engineVersion` at `0.1.0`
(see the Batch 4 entry below).

## 0.1.0 — Batch 1 (2026-07-02)

Initial deterministic core: the single JCS canonicalizer + keccak256 binding
(AD-11/12), the ledger schema + validator + `ledgerHash` (AD-20), the manifest
input-contract types (AD-7), and the pure two-axis `recon` engine (AD-1/2/13).

Golden fixture digests (`fixtures/golden/`), pinned by the determinism gate:

| Artifact       | keccak256(canonicalBytes(...))                                       |
| -------------- | ------------------------------------------------------------------- |
| `manifestHash` | `0xa9fa6392e21d2e0435d470d62fdff8a096514039acca4471e37a9f991cfb03cb` |
| `ledgerHash`   | `0x55da992a645ab89b3d9844b39ff7b4aac82d6ddfb83eb3807dad17941f2a8991` |
| `reportHash`   | `0x056e50ce0019a56d8e7bea8541dfefe79eb917a7bef31d3b9a652e2037ff4f55` |

Batch 4 grew the report (USD valuation) and regenerated `reportHash` **without**
bumping `engineVersion` — see the Batch 4 entry below.

## 0.1.0 (report schema 2) — Batch 4 (2026-07-03)

USD valuation + unrealized P/L added to the report (AD-18 consumption, AD-2,
AD-20): a `valuation` object carrying `currentValueUsd`, `costBasisUsd`,
`unrealizedPnl` (signed), the declared `usdDecimals` (`6`, micro-USD), and the
price/rate provenance actually used. The report envelope grew, so
`REPORT_SCHEMA_VERSION` bumped `1`→`2`.

`engineVersion` deliberately stays `0.1.0`. USD valuation *is* recon math, so
AD-8 would ordinarily bump it to `0.2.0`; the maintainer chose to keep the
engine at `0.1.0` for the v0.1.0 pre-release cycle so an engine `0.2.0` does not
read like a product release on the `feature/v0.1.0` branch. The report-shape
change is marked by the schema bump above; a post-MVP rebrand of `engineVersion`
(so AD-8 bumps can resume without the product-version collision) is logged in
`deferred-work.md`.

Regenerated golden digests (`fixtures/golden/`). Because the USD figures live in
the *report* and `engineVersion` is unchanged, **only `reportHash` moves** —
`manifestHash` and `ledgerHash` are byte-for-byte identical to Batch 1:

| Artifact       | keccak256(canonicalBytes(...))                                       | vs Batch 1  |
| -------------- | ------------------------------------------------------------------- | ----------- |
| `manifestHash` | `0xa9fa6392e21d2e0435d470d62fdff8a096514039acca4471e37a9f991cfb03cb` | unchanged   |
| `ledgerHash`   | `0x55da992a645ab89b3d9844b39ff7b4aac82d6ddfb83eb3807dad17941f2a8991` | unchanged   |
| `reportHash`   | `0x3d286ca68e70ecb97b1cf13615688f3e58c579766e357fdcb1c305da8b583066` | **changed** |

The `fixtures/slice/` CI cross-machine determinism harness (Story 2.8) was
regenerated too — same report-shape growth, same unchanged manifest/ledger; only
its report grew.
