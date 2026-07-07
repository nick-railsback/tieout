/**
 * The pinned Batch 2 discrepancy slice — the single source of the block window
 * both "fetch universes" must agree on (Story 2.8, AD-9).
 *
 * The indexer already imports its addresses and event definitions from the same
 * shared packages "so the two fetch universes cannot diverge" — but the block
 * range that defines *which* slice both cover was, historically, a hand-copied
 * literal in `ponder.config.ts` and `bin/pin-slice.ts`. A lockstep-edit miss
 * would have Ponder index a different range than `verify` reconstructs — the
 * exact AD-9 divergence the parity test exists to make impossible. Single-source
 * it here; the Ponder boundary narrows to `number` with `Number(...)`.
 */
export const SLICE_START_BLOCK = 25_444_667n;
export const SLICE_END_BLOCK = 25_444_922n;
