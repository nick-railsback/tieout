/**
 * The single source of truth for the engine version embedded in every report
 * (AD-8, AD-12). Per AD-8 this normally bumps on ANY change to derivation,
 * canonicalization, or `recon` math. `verify` asserts it first, so a mismatch
 * surfaces as *version skew* rather than a bare hash failure.
 *
 * NOTE — Batch 4, maintainer decision: USD valuation *is* recon math, so AD-8
 * would ordinarily bump this to `0.2.0`. It is deliberately kept at `0.1.0` for
 * the v0.1.0 pre-release cycle to avoid an engine `0.2.0` reading like a product
 * release on the `feature/v0.1.0` branch — the product/release version (every
 * `package.json`; the git tag cut at the release batch) is a SEPARATE axis from
 * this determinism fingerprint. The Batch-4 report-shape growth is instead
 * marked by {@link REPORT_SCHEMA_VERSION} `1`→`2` + the VERSIONS.md changelog.
 * The proper fix — rebranding this so it can't be mistaken for a product semver,
 * letting AD-8 bumps resume — is logged in deferred-work.md (post-MVP).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-8]
 */
export const ENGINE_VERSION = "0.1.0";

/**
 * Schema version of the emitted `report.json` envelope. Distinct from
 * {@link ENGINE_VERSION}: the report *shape* can be stable while the engine
 * math changes, and vice-versa. Bumped to `"2"` in Batch 4 — the report
 * envelope gained the `valuation` object (USD value + unrealized P/L).
 */
export const REPORT_SCHEMA_VERSION = "2";

/** Schema version accepted by the ledger validator (AD-20). */
export const LEDGER_SCHEMA_VERSION = "1";
