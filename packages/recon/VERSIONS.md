# Engine versions

`engineVersion` (`src/version.ts`) is embedded in every report and bumps on ANY
change to derivation, canonicalization, or `recon` math (AD-8). `verify` asserts
it first, so a mismatch surfaces as **version skew**, not a bare hash failure.
When it bumps, regenerate the golden fixtures intentionally (`pnpm gen:golden`).

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

Batch 4 will bump `engineVersion` when USD valuation fields are added to the
report (AD-8), regenerating these goldens.
