import { type Result, err, ok } from "./result.ts";

/**
 * The AD-6 dual-derivation rate cross-check (FR7). At each rebase block the
 * event-derived rate (`postTotalEther*1e18/postTotalShares`, from `TokenRebased`)
 * must equal the archive read (`wstETH.stEthPerToken()`, or the mock's
 * `convertToAssets(1e18)`) **EXACTLY**. Any divergence is an error — never a
 * silent tolerance. This is the one place the "exact-equal" rule is enforced, so
 * it is a bare `===` on `bigint`: introduce a tolerance here and the whole
 * trust signal collapses.
 *
 * The comparison is pure; the archive read is fetched by the shell (the `verify`
 * adapter / the MockStakedVault test path) and passed in. Between rebases the
 * archive read is NOT equality-checked (share-mint rounding is expected there),
 * so only rebase-block observations are ever handed to this function.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-6]
 */

/** One rebase-block observation: the two independently-derived rates to compare. */
export type RateObservation = {
  readonly rebaseBlock: bigint;
  /** From the `TokenRebased` event (the canonical curve). */
  readonly eventRate1e18: bigint;
  /** From an archive `stEthPerToken()` / `convertToAssets(1e18)` read. */
  readonly archiveRate1e18: bigint;
};

export type RateDivergence = {
  readonly rebaseBlock: bigint;
  readonly eventRate1e18: bigint;
  readonly archiveRate1e18: bigint;
};

/** Assert one observation's two rates are EXACTLY equal (no tolerance, FR7). */
export function crossCheckRate(observation: RateObservation): Result<bigint, RateDivergence> {
  if (observation.eventRate1e18 === observation.archiveRate1e18) {
    return ok(observation.eventRate1e18);
  }
  return err({
    rebaseBlock: observation.rebaseBlock,
    eventRate1e18: observation.eventRate1e18,
    archiveRate1e18: observation.archiveRate1e18,
  });
}

/**
 * Cross-check every rebase-block observation. Returns the first divergence as a
 * typed error (loud failure), or the confirmed rates on full agreement.
 */
export function crossCheckRates(
  observations: readonly RateObservation[],
): Result<readonly bigint[], RateDivergence> {
  const confirmed: bigint[] = [];
  for (const observation of observations) {
    const checked = crossCheckRate(observation);
    if (!checked.ok) return checked;
    confirmed.push(checked.value);
  }
  return ok(confirmed);
}
