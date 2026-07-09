/**
 * Pure, DOM-free view models for the tieout surface.
 *
 * This module is the seam that keeps the shell honest and testable: every value
 * the UI shows is derived HERE from a real `Report` (via `@tieout/recon`) or a
 * real chain read — never a hand-authored figure (AD-16/AD-17). It touches no
 * DOM and does no I/O, so it runs headless under `node:test`; `main.ts` is the
 * thin imperative shell that fetches, wires chain effects, and paints these
 * models onto the page.
 *
 * Number formatting uses viem `formatUnits` (deterministic, integer-based) —
 * never `toLocaleString` / `Intl.NumberFormat`.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-16, #AD-17, #AD-14, #AD-4]
 */
import { formatUnits } from "viem";
import {
  formatSignedWei,
  narrateReport,
  WEI_DECIMALS,
  type DiscrepancyNarration,
  type Report,
  type ReportNarration,
} from "@tieout/recon";
import type { ReportKey } from "./config.ts";

/**
 * The honesty boundary, verbatim on the surface (AD-16). A reproduced hash
 * attests the onchain-derived position and the commitment to it — never that
 * the private books are honest or complete.
 */
export const HONESTY_BOUNDARY =
  "A green result means the derivation was reproduced from public chain data — not that the books are right. tieout attests the onchain-derived position and the commitment to it, never the honesty or completeness of the private books.";

/** The anchor's honesty note (AD-14): timestamp, not correctness or identity. */
export const ANCHOR_NOTE =
  "The onchain anchor proves only that this report hash existed at or before a block — a timestamp. It is not proof the books are correct, and the submitter is a recorded fact, not an author signature.";

/** Per-report plain-language explainers, repainted as the visitor toggles
 * (CAP-2). Each says what its report actually is, that the discrepancy is
 * deliberate, and where the everyday always-green signal really lives — the
 * live position + the closing-balance check, never a hand-built reconciled
 * report (AC-5.2.b honesty). Both are real engine output; only the inputs
 * differ. */
export const REPORT_EXPLAINERS: Record<ReportKey, string> = {
  golden:
    "This report reconciles a fully synthetic, hand-authored fixture: its 150 wstETH position belongs to the vanity address 0xda7a…0000 and exists nowhere on mainnet. Its books deliberately under-record the staking reward by 0.5 stETH, so the reconciliation has a real break to narrate — a demo that always passed would prove nothing. The everyday always-green signal is the live position above and the closing-balance check (chain-derived shares matching the books) — never a hand-built “all clear”.",
  slice:
    "This report reconciles a real mainnet wstETH wallet over a pinned window of finalized blocks — the chain side re-derived entirely from public data, the ledger side taken from the books. The ledger deliberately carries an injected reward discrepancy, so the reconciliation has a real break to narrate — a demo that always passed would prove nothing. The everyday always-green signal is the live position above and the closing-balance check (chain-derived shares matching the books) — never a hand-built “all clear”.",
};

/** Render a signed USD bigint at its declared scale as `"$1.23"` / `"-$1.23"`. */
function usd(value: bigint, usdDecimals: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? "-$" : "$"}${formatUnits(magnitude, Number(usdDecimals))}`;
}

/** One reconciliation axis, formatted for display. */
export type AxisRow = {
  readonly axis: "closingShares" | "reward";
  readonly label: string;
  readonly unit: "wstETH" | "stETH";
  readonly onchain: string;
  readonly ledger: string;
  readonly delta: string;
  readonly tieOut: boolean;
  /** Screen-reader label for the ✓/✗ glyph cell — a bare "✗" reads as
   * "multiplication x", so the cell carries this accessible name instead. */
  readonly tieOutLabel: string;
};

/** The accessible name for a tie-out glyph (pairs the color/glyph with words). */
export function tieOutLabel(tieOut: boolean): string {
  return tieOut ? "ties out" : "does not tie out";
}

/** The full report view model — everything the report + diff panels render. */
export type ReportViewModel = {
  readonly subject: string;
  readonly asset: string;
  readonly window: string;
  readonly status: ReportNarration["status"];
  readonly headline: string;
  readonly narrationLines: readonly string[];
  readonly discrepancies: readonly DiscrepancyNarration[];
  readonly axes: readonly AxisRow[];
  readonly usd: {
    readonly currentValue: string;
    readonly costBasis: string;
    readonly unrealizedPnl: string;
  };
};

/** Build the report view model from a real `Report` (hydrated via
 * `parseReportJson`). The narration is generated from the report's own
 * discrepancies — no figure originates here. */
export function reportViewModel(report: Report): ReportViewModel {
  const narration = narrateReport(report);
  const { closingShares, reward } = report.axes;
  const axes: readonly AxisRow[] = [
    {
      axis: "closingShares",
      label: "Closing shares",
      unit: "wstETH",
      onchain: formatUnits(closingShares.onchain, WEI_DECIMALS),
      ledger: formatUnits(closingShares.ledger, WEI_DECIMALS),
      delta: formatSignedWei(closingShares.delta),
      tieOut: closingShares.tieOut,
      tieOutLabel: tieOutLabel(closingShares.tieOut),
    },
    {
      axis: "reward",
      label: "Reward",
      unit: "stETH",
      onchain: formatUnits(reward.onchain, WEI_DECIMALS),
      ledger: formatUnits(reward.ledger, WEI_DECIMALS),
      delta: formatSignedWei(reward.delta),
      tieOut: reward.tieOut,
      tieOutLabel: tieOutLabel(reward.tieOut),
    },
  ];

  return {
    subject: report.subject,
    asset: report.asset,
    window: `blocks ${report.pins.startBlock}–${report.pins.endBlock}`,
    status: narration.status,
    headline: narration.headline,
    narrationLines: narration.lines,
    discrepancies: narration.discrepancies,
    axes,
    usd: {
      currentValue: usd(report.valuation.currentValueUsd, report.valuation.usdDecimals),
      costBasis: usd(report.valuation.costBasisUsd, report.valuation.usdDecimals),
      unrealizedPnl: usd(report.valuation.unrealizedPnl, report.valuation.usdDecimals),
    },
  };
}

/** The raw live position, straight off the chain (Multicall3 read). */
export type LivePositionInput = {
  readonly subject: string;
  /** wstETH balance in wei (18 dp). */
  readonly balanceWstEth: bigint;
  /** stETH per wstETH, 1e18-scaled (wstETH `stEthPerToken()`). */
  readonly stEthPerToken: bigint;
};

/** The formatted live position for the everyday always-green panel. */
export type LivePositionViewModel = {
  readonly subject: string;
  readonly balanceWstEth: string;
  readonly stEthPerToken: string;
  readonly balanceStEth: string;
};

/** Format a live chain read for display. The stETH value is a display-only
 * integer computation (one truncating divide) — this is off the canonical hash
 * path, so it is not bound by the report's USD-path rules. */
export function livePositionViewModel(input: LivePositionInput): LivePositionViewModel {
  const stEth = (input.balanceWstEth * input.stEthPerToken) / 10n ** BigInt(WEI_DECIMALS);
  return {
    subject: input.subject,
    balanceWstEth: formatUnits(input.balanceWstEth, WEI_DECIMALS),
    stEthPerToken: formatUnits(input.stEthPerToken, WEI_DECIMALS),
    balanceStEth: formatUnits(stEth, WEI_DECIMALS),
  };
}

/** The result of reading the anchor for a report hash. `not-deployed` is the
 * honest default on a chain whose registry has not been deployed yet — the web
 * never fabricates a record (AD-14). */
export type AnchorState =
  | { readonly kind: "not-deployed"; readonly chainId: number }
  | { readonly kind: "not-anchored"; readonly chainId: number; readonly reportHash: string }
  | {
      readonly kind: "anchored";
      readonly chainId: number;
      readonly reportHash: string;
      readonly blockNumber: bigint;
      readonly timestamp: bigint;
    }
  | { readonly kind: "error"; readonly chainId: number; readonly message: string };

/** The formatted anchor panel view model. */
export type AnchorViewModel = {
  readonly label: string;
  readonly detail: string;
  readonly tone: "neutral" | "ok" | "warn";
};

/** Build the anchor view model. Renders "not yet anchored" honestly whenever the
 * registry is undeployed or the hash is un-attested — never a manufactured
 * record (AD-14). */
export function anchorViewModel(state: AnchorState): AnchorViewModel {
  switch (state.kind) {
    case "not-deployed":
      return {
        label: "Not yet anchored",
        tone: "neutral",
        detail: `The AttestationRegistry is not deployed on chain ${state.chainId} yet, so there is no record to read — and none is invented.`,
      };
    case "not-anchored":
      return {
        label: "Not yet anchored",
        tone: "neutral",
        detail: `This report hash has not been attested on chain ${state.chainId}.`,
      };
    case "anchored":
      return {
        label: "Anchored",
        tone: "ok",
        detail: `Attested on chain ${state.chainId} at block ${state.blockNumber} (unix ${state.timestamp}).`,
      };
    case "error":
      return {
        label: "Anchor read failed",
        tone: "warn",
        detail: `Could not read chain ${state.chainId}: ${state.message}`,
      };
  }
}
