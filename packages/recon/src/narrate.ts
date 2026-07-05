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
import { formatUnits } from "viem";
import {
  type BreakingEvent,
  type Discrepancy,
  type DiscrepancyAxis,
  type Report,
} from "./recon.ts";

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
