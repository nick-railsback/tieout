/**
 * The single source of truth for the engine version embedded in every report
 * (AD-8, AD-12). Per AD-8 this bumps on ANY change to derivation,
 * canonicalization, or `recon` math — Batch 4 bumps it when USD fields are
 * added. `verify` asserts this first, so a mismatch surfaces as *version skew*
 * rather than a bare hash failure.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-8]
 */
export const ENGINE_VERSION = "0.1.0";

/**
 * Schema version of the emitted `report.json` envelope. Distinct from
 * {@link ENGINE_VERSION}: the report *shape* can be stable while the engine
 * math changes, and vice-versa.
 */
export const REPORT_SCHEMA_VERSION = "1";

/** Schema version accepted by the ledger validator (AD-20). */
export const LEDGER_SCHEMA_VERSION = "1";
