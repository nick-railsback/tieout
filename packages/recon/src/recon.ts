import { type Hex } from "viem";
import { type CanonicalValue, canonicalHash } from "./canonical.ts";
import { type Ledger, ledgerHash } from "./ledger.ts";
import {
  type Manifest,
  type ManifestEvent,
  type RatePoint,
  type RebaseEvent,
  type TransferEvent,
  manifestHash,
} from "./manifest.ts";
import { type Result, err, ok } from "./result.ts";
import { ENGINE_VERSION, REPORT_SCHEMA_VERSION } from "./version.ts";

/** stETH-per-wstETH rate fixed-point scale (AD-2): `rate1e18` is 1e18-scaled. */
const RATE_SCALE = 10n ** 18n;

export type AxisResult = {
  /** Event/curve-derived onchain quantity. */
  readonly onchain: bigint;
  /** The ledger's booked quantity for this axis. */
  readonly ledger: bigint;
  /** `onchain - ledger`, a signed delta formed by subtraction only (AD-2). */
  readonly delta: bigint;
  readonly tieOut: boolean;
};

/** The exact breaking event named for a discrepancy (AC-1.5.c). */
export type BreakingEvent = {
  readonly txHash: string;
  readonly blockNumber: bigint;
  readonly logIndex: bigint;
};

export type DiscrepancyAxis = "closingShares" | "reward";

export type Discrepancy = {
  readonly axis: DiscrepancyAxis;
  readonly delta: bigint;
  readonly breakingEvent: BreakingEvent | null;
};

export type ReportLot = {
  readonly lotId: string;
  readonly acquisitionBlock: bigint;
  readonly shares: bigint;
  readonly costBasisUsd: bigint;
};

export type ReportPins = {
  readonly startBlock: bigint;
  readonly startHash: string;
  readonly endBlock: bigint;
  readonly endHash: string;
};

/**
 * The hash-addressed reconciliation report — the single reproducible evidence
 * artifact for a position. Merkle-shaped: an ordered list of per-lot records
 * (AD-13), embedding `manifestHash`, `ledgerHash`, `engineVersion`, and the
 * pinned endpoints (AD-12).
 */
export type Report = {
  readonly schemaVersion: string;
  readonly engineVersion: string;
  readonly subject: string;
  readonly asset: string;
  readonly pins: ReportPins;
  readonly manifestHash: Hex;
  readonly ledgerHash: Hex;
  readonly axes: {
    readonly closingShares: AxisResult;
    readonly reward: AxisResult;
  };
  readonly lots: readonly ReportLot[];
  readonly discrepancies: readonly Discrepancy[];
};

export type ReconError = {
  readonly code: string;
  readonly message: string;
};

function compareCodeUnits(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const delta = a.charCodeAt(i) - b.charCodeAt(i);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

/** The rate in effect at `block`: the most recent rebase point at or before it
 * (AD-6). `null` if the curve does not seed at/before `block`. */
function rateAt(rateCurve: readonly RatePoint[], block: bigint): bigint | null {
  let rate: bigint | null = null;
  for (const point of rateCurve) {
    if (point.rebaseBlock <= block) rate = point.rate1e18;
    else break; // strictly ordered by rebaseBlock (validated)
  }
  return rate;
}

function inWindow(event: ManifestEvent, manifest: Manifest): boolean {
  return event.blockNumber >= manifest.startBlock && event.blockNumber <= manifest.endBlock;
}

/** The latest in-window rebase — the breaking event for a reward discrepancy. */
function lastRebaseInWindow(manifest: Manifest): RebaseEvent | null {
  let found: RebaseEvent | null = null;
  for (const event of manifest.events) {
    if (event.type === "TokenRebased" && inWindow(event, manifest)) found = event;
  }
  return found;
}

/** The latest in-window transfer touching the subject — breaking event for a
 * closing-shares discrepancy. */
function lastSubjectTransferInWindow(manifest: Manifest, subject: string): TransferEvent | null {
  let found: TransferEvent | null = null;
  for (const event of manifest.events) {
    if (
      event.type === "Transfer" &&
      inWindow(event, manifest) &&
      (event.from === subject || event.to === subject)
    ) {
      found = event;
    }
  }
  return found;
}

function breakingEventOf(event: TransferEvent | RebaseEvent | null): BreakingEvent | null {
  if (event === null) return null;
  return { txHash: event.txHash, blockNumber: event.blockNumber, logIndex: event.logIndex };
}

/**
 * The pure reconciliation engine (AD-1): `(manifest, ledger) → (report,
 * reportHash)` with NO I/O, network, wall-clock, `Date.now()`/`Math.random()`,
 * float, ambient config, or address resolution. All effects live in the shell;
 * failures are returned as typed values, never thrown.
 *
 * Precondition: `manifest` and `ledger` are the outputs of `validateManifest` /
 * `validateLedger`. The engine scans manifest arrays by position and so assumes
 * each is in its declared total order (AD-4); it does not re-validate.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-1, #AD-2, #AD-13]
 */
export function recon(manifest: Manifest, ledger: Ledger): Result<
  { readonly report: Report; readonly reportHash: Hex },
  ReconError
> {
  // Recon-boundary precondition (AC-1.2.b, AD-3/AD-20): the ledger's window
  // must equal the manifest's pinned [startBlock, endBlock]. This is the point
  // where the manifest's pins and the ledger's window first coexist.
  if (
    ledger.window.startBlock !== manifest.startBlock ||
    ledger.window.endBlock !== manifest.endBlock
  ) {
    return err({
      code: "window-mismatch",
      message:
        `ledger.window [${ledger.window.startBlock}, ${ledger.window.endBlock}] ` +
        `must equal manifest pins [${manifest.startBlock}, ${manifest.endBlock}] (AD-3)`,
    });
  }

  // Version skew is asserted before any math (AD-8): a manifest produced by a
  // different engine cannot yield a comparable report.
  if (manifest.engineVersion !== ENGINE_VERSION) {
    return err({
      code: "version-skew",
      message: `manifest.engineVersion "${manifest.engineVersion}" != engine ${ENGINE_VERSION} (AD-8)`,
    });
  }

  // --- Closing-shares axis: event-derived balance vs Σ lots.shares ---
  let onchainShares = 0n;
  for (const event of manifest.events) {
    if (event.type !== "Transfer" || !inWindow(event, manifest)) continue;
    if (event.to === ledger.subject) onchainShares += event.value;
    if (event.from === ledger.subject) onchainShares -= event.value;
  }
  let ledgerShares = 0n;
  for (const lot of ledger.lots) ledgerShares += lot.shares;
  const sharesDelta = onchainShares - ledgerShares; // subtraction only (AD-2)

  // --- Reward axis: rate-curve growth vs bookedReward ---
  const rateStart = rateAt(manifest.rateCurve, manifest.startBlock);
  const rateEnd = rateAt(manifest.rateCurve, manifest.endBlock);
  if (rateStart === null || rateEnd === null) {
    return err({
      code: "rate-curve-unseeded",
      message: "rateCurve must seed at or before startBlock and cover endBlock (AD-6)",
    });
  }
  const rateGrowth = rateEnd - rateStart; // subtraction only (AD-2)
  // Multiply-before-divide with exactly one truncating (toward-zero) division
  // (AD-2). The onchain reward is derived from the CHAIN-derived share balance
  // (onchainShares), NOT the book's Σ lots.shares — this keeps the reward axis
  // independent of the book, so a broken closing-shares axis cannot silently
  // compute reward on an unreconciled base. (In a monotonic-rate window both are
  // non-negative; slashing — a decreasing rate — making rateGrowth negative is a
  // Batch-2 concern, see the deferred review follow-up.)
  const onchainReward = (onchainShares * rateGrowth) / RATE_SCALE;
  const rewardDelta = onchainReward - ledger.bookedReward;

  const closingShares: AxisResult = {
    onchain: onchainShares,
    ledger: ledgerShares,
    delta: sharesDelta,
    tieOut: sharesDelta === 0n,
  };
  const reward: AxisResult = {
    onchain: onchainReward,
    ledger: ledger.bookedReward,
    delta: rewardDelta,
    tieOut: rewardDelta === 0n,
  };

  // Name each discrepancy with its exact breaking event (AC-1.5.c). Order is
  // declared: closingShares before reward.
  const discrepancies: Discrepancy[] = [];
  if (sharesDelta !== 0n) {
    discrepancies.push({
      axis: "closingShares",
      delta: sharesDelta,
      breakingEvent: breakingEventOf(lastSubjectTransferInWindow(manifest, ledger.subject)),
    });
  }
  if (rewardDelta !== 0n) {
    discrepancies.push({
      axis: "reward",
      delta: rewardDelta,
      breakingEvent: breakingEventOf(lastRebaseInWindow(manifest)),
    });
  }

  // Per-lot records ordered by (acquisitionBlock, lotId) — the ledger validator
  // already guarantees this order; we re-sort defensively so the report
  // declares its own total order (AD-13). (Ledger lots carry acquisitionBlock
  // only; the finer (txIndex, logIndex) tiebreak collapses to block level until
  // lots gain event linkage in a later batch.)
  const lots: ReportLot[] = ledger.lots
    .toSorted((a, b) =>
      a.acquisitionBlock === b.acquisitionBlock
        ? compareCodeUnits(a.lotId, b.lotId)
        : a.acquisitionBlock < b.acquisitionBlock
          ? -1
          : 1,
    )
    .map((lot) => ({
      lotId: lot.lotId,
      acquisitionBlock: lot.acquisitionBlock,
      shares: lot.shares,
      costBasisUsd: lot.costBasisUsd,
    }));

  const report: Report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    subject: ledger.subject,
    asset: ledger.asset,
    pins: {
      startBlock: manifest.startBlock,
      startHash: manifest.startHash,
      endBlock: manifest.endBlock,
      endHash: manifest.endHash,
    },
    manifestHash: manifestHash(manifest),
    ledgerHash: ledgerHash(ledger),
    axes: { closingShares, reward },
    lots,
    discrepancies,
  };

  return ok({ report, reportHash: canonicalHash(canonicalReport(report)) });
}

/**
 * Project a report onto its canonical (hashable) form. `reportHash =
 * keccak256(canonicalBytes(canonicalReport(report)))` is the single value later
 * anchored (AC-1.5.d); writing these same bytes to disk keeps `report.json`
 * byte-identical to what was hashed (AD-11, AC-1.3.d).
 */
export function canonicalReport(report: Report): CanonicalValue {
  return {
    schemaVersion: report.schemaVersion,
    engineVersion: report.engineVersion,
    subject: report.subject,
    asset: report.asset,
    pins: {
      startBlock: report.pins.startBlock,
      startHash: report.pins.startHash,
      endBlock: report.pins.endBlock,
      endHash: report.pins.endHash,
    },
    manifestHash: report.manifestHash,
    ledgerHash: report.ledgerHash,
    axes: {
      closingShares: canonicalAxis(report.axes.closingShares),
      reward: canonicalAxis(report.axes.reward),
    },
    lots: report.lots.map((lot) => ({
      lotId: lot.lotId,
      acquisitionBlock: lot.acquisitionBlock,
      shares: lot.shares,
      costBasisUsd: lot.costBasisUsd,
    })),
    discrepancies: report.discrepancies.map((d) => ({
      axis: d.axis,
      delta: d.delta,
      breakingEvent:
        d.breakingEvent === null
          ? null
          : {
              txHash: d.breakingEvent.txHash,
              blockNumber: d.breakingEvent.blockNumber,
              logIndex: d.breakingEvent.logIndex,
            },
    })),
  };
}

function canonicalAxis(axis: AxisResult): CanonicalValue {
  return {
    onchain: axis.onchain,
    ledger: axis.ledger,
    delta: axis.delta,
    tieOut: axis.tieOut,
  };
}
