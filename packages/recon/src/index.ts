/**
 * `@tieout/recon` — the pure, deterministic reconciliation core.
 *
 * Public surface for Batch 1: the ONE canonicalizer/keccak module (AD-11/12),
 * the ledger schema + validator + `ledgerHash` (AD-20), the manifest
 * input-contract types (AD-7), and `recon()` (AD-1/2/13). The manifest
 * *derivation* function (raw logs → manifest) is NOT here — that is Batch 2.
 */
export { type CanonicalValue, canonicalize, canonicalBytes, canonicalHash } from "./canonical.ts";
export { type Result, type Ok, type Err, ok, err } from "./result.ts";
export { ENGINE_VERSION, REPORT_SCHEMA_VERSION, LEDGER_SCHEMA_VERSION } from "./version.ts";
export { type FieldError } from "./validate.ts";
export {
  type Ledger,
  type LedgerWindow,
  type Lot,
  ALLOWED_ASSETS,
  validateLedger,
  canonicalLedger,
  ledgerHash,
} from "./ledger.ts";
export {
  type Manifest,
  type ManifestEvent,
  type TransferEvent,
  type RebaseEvent,
  type RatePoint,
  type ManifestAddress,
  type PriceObservation,
  validateManifest,
  canonicalManifest,
  manifestHash,
} from "./manifest.ts";
export {
  type Report,
  type ReportPins,
  type ReportLot,
  type AxisResult,
  type Discrepancy,
  type DiscrepancyAxis,
  type BreakingEvent,
  type ReconError,
  recon,
  canonicalReport,
} from "./recon.ts";
