import { type Hex } from "viem";
import { type CanonicalValue, canonicalHash, compareCodeUnits } from "./canonical.ts";
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

/** wstETH shares are wei — 18 dp. Numerically equal to {@link RATE_SCALE} but a
 * distinct AD-2 normalization axis: this rescales the share balance, that
 * rescales the 1e18 rate. Named separately so the USD denominator reads as the
 * three explicit scales it folds (shares · rate · price). */
const SHARES_SCALE = 10n ** 18n;

/**
 * The report's declared fixed USD scale (AD-18/AD-20): micro-USD, 6 dp. The
 * golden ledger authors `costBasisUsd` at this scale ($250,000 = 250000000000),
 * so `currentValueUsd` MUST share it or `unrealizedPnl = currentValueUsd − Σ
 * costBasisUsd` is meaningless. Emitted as a decimal-string bigint — never a
 * float, and never via a viem unit helper (`parseUnits` rounds; `formatUnits`
 * yields a human string), which would violate AD-2's one-truncating-division
 * rule. [viem@2.54.1 src/utils/unit/parseUnits.ts#L17-L57]
 */
const USD_DECIMALS = 6n;
const USD_SCALE = 10n ** USD_DECIMALS;

/**
 * Upper bound on the feed's `decimals`, guarding the ONE input-controlled
 * exponentiation on the canonical path (`10n ** price.decimals`). A Chainlink
 * `decimals()` is a `uint8` and real feeds are ≤ 18, so 36 is generous. Without
 * this bound a validated-but-adversarial manifest — `parseNonNegInt` bounds
 * `decimals` below but NOT above — could carry an astronomically large value and
 * make `recon` materialize a multi-billion-digit bigint, hanging the trustless
 * re-derivation path (a DoS). [Source: docs/ARCHITECTURE-SPINE.md#AD-18]
 */
const MAX_PRICE_DECIMALS = 36n;

export type AxisResult = {
  /** Event/curve-derived onchain quantity. */
  readonly onchain: bigint;
  /** The ledger's booked quantity for this axis. */
  readonly ledger: bigint;
  /** `onchain - ledger`, a signed delta formed by subtraction only (AD-2). */
  readonly delta: bigint;
  readonly tieOut: boolean;
};

/**
 * The last in-window event that COULD have broken an axis — a heuristic locator,
 * NOT a proven cause (AC-1.5.c). Each axis is an aggregate sum, so when a window
 * holds several in-window rebases (reward) or subject transfers (closingShares)
 * the delta cannot single out which one the books missed; `recon` names the most
 * recent candidate. Consumers must phrase it as a locator ("last in-window …"),
 * never as factual attribution. (The field is `breakingEvent` for wire/JSON
 * stability — renaming it would change the canonical report bytes.)
 */
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
 * The USD valuation leg (AD-18/AD-20). `currentValueUsd` is the CHAIN-derived
 * position (`sharesValued`) valued at the block-pinned public price observation
 * — an onchain-derived fact. `costBasisUsd` (Σ of the book's per-lot cost) is a
 * BOOK claim, so `unrealizedPnl` mixes a chain fact with a book claim (AD-16):
 * a reproduced hash attests the derivation, never the honesty of the books.
 * Every integer is a decimal-string `bigint`; `unrealizedPnl` is signed —
 * negative when the chain value is below the booked cost basis.
 */
export type ReportValuation = {
  /** The declared fixed report USD scale — 6 (micro-USD) for the MVP (AD-20). */
  readonly usdDecimals: bigint;
  readonly currentValueUsd: bigint;
  readonly costBasisUsd: bigint;
  readonly unrealizedPnl: bigint;
  /** The chain-derived shares actually valued (`onchainShares`, AD-16). */
  readonly sharesValued: bigint;
  /** The stETH-per-wstETH rate used — `rateEnd`, reused from the reward axis. */
  readonly rate1e18: bigint;
  /** Price provenance, read from `manifest.priceObservation` (never assumed). */
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly priceDecimals: bigint;
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
  readonly valuation: ReportValuation;
};

export type ReconError = {
  readonly code: string;
  readonly message: string;
};

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

/** Resolve a token address from the manifest's OWN embedded table (AD-5),
 * lowercased. `null` when absent — the manifest is malformed for this engine. */
function manifestTokenAddress(manifest: Manifest, symbol: string): string | null {
  const row = manifest.addressTable.find((entry) => entry.symbol === symbol);
  return row ? row.address.toLowerCase() : null;
}

/** The latest in-window rebase from the real stETH token — the last candidate for
 * a reward discrepancy (a locator, not a proven cause; see {@link BreakingEvent}). */
function lastRebaseInWindow(manifest: Manifest, stETH: string): RebaseEvent | null {
  let found: RebaseEvent | null = null;
  for (const event of manifest.events) {
    if (
      event.type === "TokenRebased" &&
      event.address.toLowerCase() === stETH &&
      inWindow(event, manifest)
    ) {
      found = event;
    }
  }
  return found;
}

/** The latest in-window wstETH transfer touching the subject — the last candidate
 * for a closing-shares discrepancy (a locator, not a proven cause; see {@link BreakingEvent}). */
function lastSubjectTransferInWindow(
  manifest: Manifest,
  subject: string,
  wstETH: string,
): TransferEvent | null {
  let found: TransferEvent | null = null;
  for (const event of manifest.events) {
    if (
      event.type === "Transfer" &&
      event.address.toLowerCase() === wstETH &&
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
export function recon(
  manifest: Manifest,
  ledger: Ledger,
): Result<{ readonly report: Report; readonly reportHash: Hex }, ReconError> {
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

  // Resolve the real token addresses from the manifest's OWN embedded table so
  // recon trusts only events emitted by the wstETH/stETH contracts — derive
  // already filters emitters, but recon must not re-trust a hand-authored,
  // validator-passing manifest that injects a Transfer from a foreign contract
  // (SEC-2). A manifest lacking the tokens is malformed for this engine.
  const wstETH = manifestTokenAddress(manifest, "wstETH");
  const stETH = manifestTokenAddress(manifest, "stETH");
  if (wstETH === null || stETH === null) {
    return err({
      code: "missing-token-address",
      message: "manifest.addressTable must carry wstETH and stETH (AD-5)",
    });
  }

  // --- Closing-shares axis: event-derived balance vs Σ lots.shares ---
  let onchainShares = 0n;
  for (const event of manifest.events) {
    if (
      event.type !== "Transfer" ||
      event.address.toLowerCase() !== wstETH ||
      !inWindow(event, manifest)
    ) {
      continue;
    }
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
      breakingEvent: breakingEventOf(lastSubjectTransferInWindow(manifest, ledger.subject, wstETH)),
    });
  }
  if (rewardDelta !== 0n) {
    discrepancies.push({
      axis: "reward",
      delta: rewardDelta,
      breakingEvent: breakingEventOf(lastRebaseInWindow(manifest, stETH)),
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

  // --- USD valuation + unrealized P/L (AD-18 consumption, AD-2, AD-20) ---
  // Value the CHAIN-derived closing balance (onchainShares, AD-16) at the
  // block-pinned public price observation already carried in the hashed manifest
  // — no `latest`, no DEX spot. The three input scales are folded into a single
  // numerator/denominator with EXACTLY ONE truncating division (AD-2):
  //
  //   onchainShares(18dp) · rateEnd(1e18) · answer(feed-native) · 10^USD_DECIMALS
  //   ───────────────────────────────────────────────────────────────────────────
  //             10^18 (shares) · 10^18 (rate) · 10^decimals (price)
  //
  // `priceObservation.decimals` is read from the manifest, NEVER assumed 8.
  const price = manifest.priceObservation;
  // Guard the one input-controlled exponentiation (review follow-up, AD-18): a
  // manifest can pass validateManifest with an unbounded `decimals`, so bound it
  // here before `10n ** decimals` rather than trust the value's magnitude.
  if (price.decimals > MAX_PRICE_DECIMALS) {
    return err({
      code: "price-decimals-out-of-range",
      message:
        `priceObservation.decimals ${price.decimals} exceeds the supported ` +
        `max ${MAX_PRICE_DECIMALS} (AD-18)`,
    });
  }
  const priceScale = 10n ** price.decimals;
  const usdNumerator = onchainShares * rateEnd * price.answer * USD_SCALE;
  const usdDenominator = SHARES_SCALE * RATE_SCALE * priceScale;
  const currentValueUsd = usdNumerator / usdDenominator; // one truncating `/` (AD-2)

  let costBasisUsd = 0n;
  for (const lot of ledger.lots) costBasisUsd += lot.costBasisUsd;
  // Subtraction only (AD-2); signed — negative when chain value < booked cost.
  const unrealizedPnl = currentValueUsd - costBasisUsd;

  const valuation: ReportValuation = {
    usdDecimals: USD_DECIMALS,
    currentValueUsd,
    costBasisUsd,
    unrealizedPnl,
    sharesValued: onchainShares,
    rate1e18: rateEnd,
    roundId: price.roundId,
    answer: price.answer,
    priceDecimals: price.decimals,
  };

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
    valuation,
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
    valuation: canonicalValuation(report.valuation),
  };
}

function canonicalValuation(valuation: ReportValuation): CanonicalValue {
  return {
    usdDecimals: valuation.usdDecimals,
    currentValueUsd: valuation.currentValueUsd,
    costBasisUsd: valuation.costBasisUsd,
    unrealizedPnl: valuation.unrealizedPnl,
    sharesValued: valuation.sharesValued,
    rate1e18: valuation.rate1e18,
    roundId: valuation.roundId,
    answer: valuation.answer,
    priceDecimals: valuation.priceDecimals,
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
