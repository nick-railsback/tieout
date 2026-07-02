import { type RatePoint } from "./manifest.ts";
import { type Result, err, ok } from "./result.ts";

/**
 * The canonical stETH-per-wstETH rate curve, event-derived from Lido
 * `TokenRebased` (AD-6). It is a step function: `rate1e18` in effect from a
 * rebase's block onward, and the rate at any position `p` is the most recent
 * rebase `≤ p`. The curve is **seeded** from the last rebase at or before
 * `startBlock` (so every in-window position has a rate — the adapter must fetch
 * one rebase before the window), then carries every rebase inside the window.
 *
 * Pure integer math (AD-2): `rate1e18 = postTotalEther * 1e18 / postTotalShares`,
 * multiply-before-divide, exactly one truncating division. This identity is the
 * one the AD-6 cross-check asserts equal to `wstETH.stEthPerToken()` at rebase
 * blocks (live-verified, Note 1). A slashing rebase (rate DECREASES) is handled
 * by construction — the division truncates toward zero (carried-forward D3).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-6]
 */

const E18 = 10n ** 18n;

/** A decoded Lido `TokenRebased` observation (the fields the rate needs). */
export type RebaseObservation = {
  readonly rebaseBlock: bigint;
  readonly postTotalEther: bigint;
  readonly postTotalShares: bigint;
};

export type RateCurveError = { readonly kind: "zero-shares"; readonly rebaseBlock: bigint };

/** `postTotalEther * 1e18 / postTotalShares` — one truncating division (AD-2). */
export function rateFromRebase(postTotalEther: bigint, postTotalShares: bigint): bigint {
  return (postTotalEther * E18) / postTotalShares;
}

/**
 * Build the canonical rate curve over `[startBlock, endBlock]`. Dedups rebases
 * by block, keeps the seed (last rebase `≤ startBlock`) plus every rebase in
 * `(startBlock, endBlock]`, and emits them in strictly-increasing block order
 * (as `validateManifest` requires). Rebases after `endBlock` are excluded.
 */
export function buildRateCurve(
  rebases: readonly RebaseObservation[],
  startBlock: bigint,
  endBlock: bigint,
): Result<RatePoint[], RateCurveError> {
  const byBlock = new Map<bigint, RebaseObservation>();
  for (const rebase of rebases) {
    if (rebase.postTotalShares === 0n) {
      return err({ kind: "zero-shares", rebaseBlock: rebase.rebaseBlock });
    }
    if (!byBlock.has(rebase.rebaseBlock)) byBlock.set(rebase.rebaseBlock, rebase);
  }

  const sorted = [...byBlock.values()].sort((a, b) =>
    a.rebaseBlock < b.rebaseBlock ? -1 : a.rebaseBlock > b.rebaseBlock ? 1 : 0,
  );

  let seed: RebaseObservation | null = null;
  const inWindow: RebaseObservation[] = [];
  for (const rebase of sorted) {
    if (rebase.rebaseBlock <= startBlock) {
      seed = rebase; // advance to the LAST rebase at or before startBlock
    } else if (rebase.rebaseBlock <= endBlock) {
      inWindow.push(rebase);
    }
    // rebaseBlock > endBlock → excluded from the window
  }

  const chosen = seed === null ? inWindow : [seed, ...inWindow];
  return ok(
    chosen.map((rebase) => ({
      rebaseBlock: rebase.rebaseBlock,
      rate1e18: rateFromRebase(rebase.postTotalEther, rebase.postTotalShares),
    })),
  );
}
