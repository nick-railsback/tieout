/**
 * The single source of truth for the engine version embedded in every report
 * (AD-8, AD-12) — the determinism *fingerprint*, deliberately a SEPARATE axis
 * from the product/release version (every `package.json`; the git tag cut at the
 * release batch). Per AD-8 it bumps on ANY change to derivation,
 * canonicalization, or `recon` math. `verify` asserts it first, so a mismatch
 * surfaces as *version skew* rather than a bare hash failure.
 *
 * Bumped `0.1.0`→`0.2.0` in Batch 4: USD valuation is `recon` math (AD-8), so
 * two engines running the pre- and post-valuation math must stamp DIFFERENT
 * fingerprints — otherwise the skew guard cannot tell them apart and both would
 * claim `0.1.0` for divergent hashes. Re-armed here while nothing external
 * depends on the value (pre-first-anchor). The report *shape* growth is tracked
 * independently by {@link REPORT_SCHEMA_VERSION} `1`→`2` + the VERSIONS.md
 * changelog; this constant tracks the *math*, that one tracks the *envelope*.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-8]
 */
export const ENGINE_VERSION = "0.2.0";

/**
 * Schema version of the emitted `report.json` envelope. Distinct from
 * {@link ENGINE_VERSION}: the report *shape* can be stable while the engine
 * math changes, and vice-versa. Bumped to `"2"` in Batch 4 — the report
 * envelope gained the `valuation` object (USD value + unrealized P/L).
 */
export const REPORT_SCHEMA_VERSION = "2";

/** Schema version accepted by the ledger validator (AD-20). */
export const LEDGER_SCHEMA_VERSION = "1";
