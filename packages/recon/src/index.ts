/**
 * `@tieout/recon` — the pure, deterministic reconciliation core.
 *
 * Public surface for Batch 1: the ONE canonicalizer/keccak module (AD-11/12),
 * the ledger schema + validator + `ledgerHash` (AD-20), the manifest
 * input-contract types (AD-7), and `recon()` (AD-1/2/13). Batch 2 adds the
 * shared derivation (AD-9): the `RawLog` input, the shared event/filter
 * definitions, and `derive()` — consumed by both the `verify` adapter and the
 * Ponder live adapter.
 */
export { type CanonicalValue, canonicalize, canonicalBytes, canonicalHash } from "./canonical.ts";
export { type Result, type Ok, type Err, ok, err } from "./result.ts";
export { ENGINE_VERSION, REPORT_SCHEMA_VERSION, LEDGER_SCHEMA_VERSION } from "./version.ts";
export { SLICE_START_BLOCK, SLICE_END_BLOCK } from "./slice.ts";
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
  type ReportValuation,
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
// Batch 2 — the shared derivation (AD-9).
export { type RawLog } from "./rawlog.ts";
export {
  TRANSFER_EVENT,
  TOKEN_REBASED_EVENT,
  TRANSFER_TOPIC0,
  TOKEN_REBASED_TOPIC0,
} from "./events.ts";
export { type LogFilter, LOG_FILTERS, DATA_CHAIN_ID } from "./filter.ts";
export {
  type RebaseObservation,
  type RateCurveError,
  rateFromRebase,
  buildRateCurve,
} from "./ratecurve.ts";
export {
  type RateObservation,
  type RateDivergence,
  crossCheckRate,
  crossCheckRates,
} from "./crosscheck.ts";
export {
  type PriceRound,
  type PriceGuardError,
  DEFAULT_PRICE_MAX_STALENESS_SECS,
  guardPriceRound,
  toPriceObservation,
} from "./priceobs.ts";
export { type BlockChunk, chunkRange } from "./chunks.ts";
export {
  type PinCapture,
  type PriceResolveError,
  viemLogToRawLog,
  fetchRawLogs,
  fetchRebaseAt,
  findSeedRebaseBlock,
  capturePins,
  crossCheckRateCurveArchive,
  resolvePriceObservation,
} from "./l0fetch.ts";
export {
  type ReconstructParams,
  type ReconstructError,
  type Reconstruction,
  mainnetTokenTable,
  reconstructManifest,
} from "./reconstruct.ts";
export {
  type DerivationInput,
  type DerivationError,
  derive,
} from "./derivation.ts";
export {
  type ReportBinding,
  type SignatureEnvelope,
  type SignatureCheck,
  TIEOUT_DOMAIN_NAME,
  TIEOUT_DOMAIN_VERSION,
  SECP256K1_HALF_N,
  signReport,
  verifyReportSignature,
} from "./signature.ts";
// Batch 5 — Story 5.1: the pure, non-canonical explain-itself narration (AD-17)
// plus the report.json hydrator the web renders through. Presentational only:
// reads a Report, never enters the hashed bytes.
export {
  type ReportNarration,
  type DiscrepancyNarration,
  narrateReport,
  narrateDiscrepancy,
  parseReportJson,
} from "./narrate.ts";
