/**
 * Story 5.1 — the pure, deterministic explain-itself narration (AD-17).
 *
 * Turns `recon`'s real diff output — `report.discrepancies` and the tie-out
 * axes — into human sentences that NAME the exact breaking event
 * `(txHash, blockNumber, logIndex)` (AD-4) and its cause. Every number and
 * identifier printed is COPIED from the report; the template supplies only the
 * sentence scaffolding. Nothing is recomputed and nothing is hand-authored on
 * the canonical path.
 *
 * PURE (AD-1): no I/O, no network, no wall-clock (`Date.now()`), no
 * `Math.random()`, no float, no ambient config, no locale formatter. It reads
 * only its `Report` argument. Signed amounts are rendered with viem
 * `formatUnits` (deterministic, integer-based) — never `toLocaleString` /
 * `Intl.NumberFormat`, which are locale-dependent and would break the
 * byte-identical-narration guarantee.
 *
 * NON-CANONICAL (AD-17): this is UI-only presentational text. It is a SEPARATE
 * function — NOT a field on `Report`, NOT part of `canonicalReport`, and it
 * appears in NO hashed byte. Its very existence cannot move `reportHash`
 * (proven in `test/narrate.test.ts`). The signed `delta` and the
 * `(txHash, blockNumber, logIndex)` triple it prints are canonical facts
 * carried straight through; only the surrounding sentence is non-canonical.
 *
 * A green narration means "derivation reproduced," not "the books are right"
 * (AD-16) — the headline says so.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-17, #AD-16, #AD-1, #AD-4]
 */
import { formatUnits, type Hex } from "viem";
import {
  type AxisResult,
  type BreakingEvent,
  type Discrepancy,
  type DiscrepancyAxis,
  type Report,
  type ReportLot,
  type ReportPins,
  type ReportValuation,
} from "./recon.ts";
import { DECIMAL_INT } from "./validate.ts";

/** wstETH shares and stETH rewards are both 18-dp wei on the report. */
const WEI_DECIMALS = 18;

/** Per-discrepancy narration: the human line plus the canonical facts it names,
 * echoed so a UI can link the event without re-parsing the sentence. */
export type DiscrepancyNarration = {
  readonly axis: DiscrepancyAxis;
  /** The signed delta, echoed verbatim from the report (a canonical fact). */
  readonly delta: bigint;
  /** The exact breaking event named, or `null` when the report names none. */
  readonly breakingEvent: BreakingEvent | null;
  /** The full human sentence (UI-only, non-canonical text). */
  readonly line: string;
};

/** The narration of a whole report: the reconciliation state, a one-line
 * headline, a flat line list for simple rendering, and the structured
 * per-discrepancy detail. */
export type ReportNarration = {
  readonly status: "reconciled" | "discrepancy";
  readonly headline: string;
  readonly lines: readonly string[];
  readonly discrepancies: readonly DiscrepancyNarration[];
};

/** Render an 18-dp wei bigint as a signed decimal string, e.g. `-500…000n` →
 * `"-0.5"`. Uses viem `formatUnits` on the magnitude and prefixes an explicit
 * sign so the direction of the book-vs-chain gap reads honestly. */
function formatSignedWei(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? "-" : "+"}${formatUnits(magnitude, WEI_DECIMALS)}`;
}

/** Name a breaking event by its totally-ordered identity (AD-4). */
function nameEvent(event: BreakingEvent): string {
  return `block ${event.blockNumber} (tx ${event.txHash}, logIndex ${event.logIndex})`;
}

/**
 * Narrate one discrepancy from its real axis, signed delta, and named event.
 * A `reward` gap is unbooked on-chain reward; a `closingShares` gap is a
 * book-vs-chain share-balance gap. The named event is the LAST in-window
 * candidate for the axis (a heuristic locator, not a proven cause — see
 * {@link BreakingEvent}), so the prose points at it, never attributes causation.
 * When `breakingEvent` is `null` the delta is still named honestly — no event is
 * fabricated.
 */
export function narrateDiscrepancy(discrepancy: Discrepancy): DiscrepancyNarration {
  const amount = formatSignedWei(discrepancy.delta);
  const event = discrepancy.breakingEvent;

  // The named event is the LAST in-window candidate for the axis, not a proven
  // cause: the axes are aggregate sums, so with several in-window rebases/
  // transfers the delta cannot single out which one broke. Phrase it as a
  // locator ("last in-window …"), never as factual attribution (MAINT-1).
  let line: string;
  if (discrepancy.axis === "reward") {
    line =
      event === null
        ? `Reward: chain shows ${amount} stETH of reward with no in-window rebase event to name.`
        : `Reward: chain shows ${amount} stETH of unbooked reward; last in-window rebase at ${nameEvent(event)}.`;
  } else {
    line =
      event === null
        ? `Closing shares: a ${amount} wstETH book-vs-chain balance gap with no in-window subject transfer to name.`
        : `Closing shares: a ${amount} wstETH book-vs-chain balance gap; last in-window subject transfer at ${nameEvent(event)}.`;
  }

  return { axis: discrepancy.axis, delta: discrepancy.delta, breakingEvent: event, line };
}

/**
 * Narrate a whole report. An empty `discrepancies` list is the everyday
 * always-green state ("reconciled — derivation reproduced"); otherwise each
 * discrepancy is narrated with its exact breaking event. The headline always
 * carries the honesty boundary (AD-16): a reproduced derivation is not a claim
 * the books are right.
 */
export function narrateReport(report: Report): ReportNarration {
  if (report.discrepancies.length === 0) {
    const headline = "Reconciled — derivation reproduced; no book-vs-chain discrepancy.";
    return { status: "reconciled", headline, lines: [headline], discrepancies: [] };
  }

  const discrepancies = report.discrepancies.map(narrateDiscrepancy);
  const count = discrepancies.length;
  const noun = count === 1 ? "discrepancy" : "discrepancies";
  const headline = `${count} book-vs-chain ${noun} — derivation reproduced, but the books differ from chain.`;

  return {
    status: "discrepancy",
    headline,
    lines: [headline, ...discrepancies.map((d) => d.line)],
    discrepancies,
  };
}

// --- Presentational hydration: report.json (on disk) → Report (in memory) ---
//
// The web loads the committed `report.json` as a static asset (AD-13: it renders
// the immutable artifact, never re-hashes it). Canonical JSON encodes every
// integer as a decimal string (RFC-8785); the in-memory `Report` uses `bigint`.
// `parseReportJson` is the pure, field-aware inverse of `canonicalReport` that
// re-hydrates those strings — owned here (beside the `Report` type's package)
// so no consumer hand-rolls the coercion and drifts from the shape. It reads
// only its argument; it does not hash, re-serialize, or mutate anything.

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`report.${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(object: Record<string, unknown>, key: string, path: string): string {
  const value = object[key];
  if (typeof value !== "string") throw new Error(`report.${path}${key} must be a string`);
  return value;
}

function asBigint(object: Record<string, unknown>, key: string, path: string): bigint {
  const value = object[key];
  if (typeof value !== "string" || !DECIMAL_INT.test(value)) {
    throw new Error(`report.${path}${key} must be a decimal-string integer`);
  }
  return BigInt(value);
}

function asBoolean(object: Record<string, unknown>, key: string, path: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") throw new Error(`report.${path}${key} must be a boolean`);
  return value;
}

function parsePins(value: unknown): ReportPins {
  const object = asRecord(value, "pins");
  return {
    startBlock: asBigint(object, "startBlock", "pins."),
    startHash: asString(object, "startHash", "pins."),
    endBlock: asBigint(object, "endBlock", "pins."),
    endHash: asString(object, "endHash", "pins."),
  };
}

function parseAxis(value: unknown, name: string): AxisResult {
  const object = asRecord(value, `axes.${name}`);
  const path = `axes.${name}.`;
  return {
    onchain: asBigint(object, "onchain", path),
    ledger: asBigint(object, "ledger", path),
    delta: asBigint(object, "delta", path),
    tieOut: asBoolean(object, "tieOut", path),
  };
}

function parseLot(value: unknown): ReportLot {
  const object = asRecord(value, "lots[]");
  return {
    lotId: asString(object, "lotId", "lots[]."),
    acquisitionBlock: asBigint(object, "acquisitionBlock", "lots[]."),
    shares: asBigint(object, "shares", "lots[]."),
    costBasisUsd: asBigint(object, "costBasisUsd", "lots[]."),
  };
}

function parseDiscrepancyAxis(value: string): DiscrepancyAxis {
  if (value === "closingShares" || value === "reward") return value;
  throw new Error(`report.discrepancies[].axis "${value}" is not a known axis`);
}

function parseDiscrepancy(value: unknown): Discrepancy {
  const object = asRecord(value, "discrepancies[]");
  const rawEvent = object["breakingEvent"];
  let breakingEvent: BreakingEvent | null;
  if (rawEvent === null) {
    breakingEvent = null;
  } else {
    const event = asRecord(rawEvent, "discrepancies[].breakingEvent");
    breakingEvent = {
      txHash: asString(event, "txHash", "discrepancies[].breakingEvent."),
      blockNumber: asBigint(event, "blockNumber", "discrepancies[].breakingEvent."),
      logIndex: asBigint(event, "logIndex", "discrepancies[].breakingEvent."),
    };
  }
  return {
    axis: parseDiscrepancyAxis(asString(object, "axis", "discrepancies[].")),
    delta: asBigint(object, "delta", "discrepancies[]."),
    breakingEvent,
  };
}

function parseValuation(value: unknown): ReportValuation {
  const object = asRecord(value, "valuation");
  const path = "valuation.";
  return {
    usdDecimals: asBigint(object, "usdDecimals", path),
    currentValueUsd: asBigint(object, "currentValueUsd", path),
    costBasisUsd: asBigint(object, "costBasisUsd", path),
    unrealizedPnl: asBigint(object, "unrealizedPnl", path),
    sharesValued: asBigint(object, "sharesValued", path),
    rate1e18: asBigint(object, "rate1e18", path),
    roundId: asBigint(object, "roundId", path),
    answer: asBigint(object, "answer", path),
    priceDecimals: asBigint(object, "priceDecimals", path),
  };
}

/** Hydrate a canonical `report.json` value (string-encoded bigints) into the
 * exact `Report` the engine produces — the inverse of `canonicalReport`. Throws
 * on a malformed report; the shell (the web) owns that error state. */
export function parseReportJson(value: unknown): Report {
  const object = asRecord(value, "");
  const axes = asRecord(object["axes"], "axes");
  const lots = object["lots"];
  const discrepancies = object["discrepancies"];
  if (!Array.isArray(lots)) throw new Error("report.lots must be an array");
  if (!Array.isArray(discrepancies)) throw new Error("report.discrepancies must be an array");

  return {
    schemaVersion: asString(object, "schemaVersion", ""),
    engineVersion: asString(object, "engineVersion", ""),
    subject: asString(object, "subject", ""),
    asset: asString(object, "asset", ""),
    pins: parsePins(object["pins"]),
    manifestHash: asString(object, "manifestHash", "") as Hex,
    ledgerHash: asString(object, "ledgerHash", "") as Hex,
    axes: {
      closingShares: parseAxis(axes["closingShares"], "closingShares"),
      reward: parseAxis(axes["reward"], "reward"),
    },
    lots: lots.map(parseLot),
    discrepancies: discrepancies.map(parseDiscrepancy),
    valuation: parseValuation(object["valuation"]),
  };
}
