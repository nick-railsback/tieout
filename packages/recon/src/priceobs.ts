import { type PriceObservation } from "./manifest.ts";
import { type Result, err, ok } from "./result.ts";

/**
 * The AD-18 price-observation resolution guards — pure. USD figures derive from
 * a pinned public Chainlink round in effect at the finalized `endBlock` (never
 * `latest`, never a DEX spot). The SHELL resolves the round phase-aware by
 * reading `latestRoundData` AT `endBlock` (pinned) — which returns the proxy
 * `roundId` with the correct `phaseId` (Note 4) — and `decimals` FROM the feed
 * (never assumed 8). These pure guards reject a stale or invalid observation so
 * the shell fails loudly rather than pinning a dead round (AC-2.5.b).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-18]
 */

/** A Chainlink round as read from the feed (with `decimals` folded in). */
export type PriceRound = {
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly updatedAt: bigint;
  readonly decimals: bigint;
};

/** Bounded staleness window (25h) — covers a 24h Chainlink heartbeat + margin. */
export const DEFAULT_PRICE_MAX_STALENESS_SECS = 90_000n;

export type PriceGuardError =
  | { readonly kind: "non-positive-answer"; readonly answer: bigint }
  | { readonly kind: "future-update"; readonly updatedAt: bigint; readonly endTimestamp: bigint }
  | {
      readonly kind: "stale";
      readonly updatedAt: bigint;
      readonly endTimestamp: bigint;
      readonly maxStalenessSecs: bigint;
    };

/**
 * Guard a resolved round against the pinned `endBlock` timestamp: the answer
 * must be positive, the round must have been updated at or before `endBlock`
 * (it's "the latest round whose `updatedAt` ≤ endBlock ts"), and not older than
 * the bounded staleness window. Any failure is a loud typed error.
 */
export function guardPriceRound(
  round: PriceRound,
  endTimestamp: bigint,
  maxStalenessSecs: bigint = DEFAULT_PRICE_MAX_STALENESS_SECS,
): Result<PriceRound, PriceGuardError> {
  if (round.answer <= 0n) {
    return err({ kind: "non-positive-answer", answer: round.answer });
  }
  if (round.updatedAt > endTimestamp) {
    return err({ kind: "future-update", updatedAt: round.updatedAt, endTimestamp });
  }
  if (endTimestamp - round.updatedAt > maxStalenessSecs) {
    return err({ kind: "stale", updatedAt: round.updatedAt, endTimestamp, maxStalenessSecs });
  }
  return ok(round);
}

/** Project a guarded round into the manifest's `priceObservation` slot (AD-18). */
export function toPriceObservation(
  feedAddress: string,
  round: PriceRound,
  observedBlock: bigint,
): PriceObservation {
  return {
    feedAddress: feedAddress.toLowerCase(),
    roundId: round.roundId,
    answer: round.answer,
    decimals: round.decimals,
    observedBlock,
  };
}
