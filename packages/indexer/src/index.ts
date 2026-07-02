import { ponder } from "ponder:registry";
import { rawLog } from "ponder:schema";
import { ponderEventToRawLog } from "./adapter.ts";

/**
 * Build the accumulated-row values from a Ponder log event via the shared
 * adapter (number → bigint at the boundary, AD-2).
 */
function rowFor(event: Parameters<typeof ponderEventToRawLog>[0] & { id: string }) {
  const raw = ponderEventToRawLog(event);
  return {
    id: event.id,
    address: raw.address,
    topics: [...raw.topics],
    data: raw.data,
    blockNumber: raw.blockNumber,
    txIndex: raw.txIndex,
    logIndex: raw.logIndex,
    blockHash: raw.blockHash,
    txHash: raw.txHash,
  };
}

/**
 * Accumulate each normalized log idempotently (keyed by `event.id`). Ponder
 * re-runs handlers on reorgs, so `onConflictDoNothing` keeps accumulation
 * deterministic + idempotent. After `/ready` (historical sync complete), the
 * accumulated rows feed the ONE shared `derive` for whole-range manifest
 * reconstruction — Ponder is NOT on the verify path (AD-9).
 */
ponder.on("WstETH:Transfer", async ({ event, context }) => {
  await context.db.insert(rawLog).values(rowFor(event)).onConflictDoNothing();
});

ponder.on("StETH:TokenRebased", async ({ event, context }) => {
  await context.db.insert(rawLog).values(rowFor(event)).onConflictDoNothing();
});
