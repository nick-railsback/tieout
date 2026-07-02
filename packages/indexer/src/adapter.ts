import { type RawLog } from "@tieout/recon";

/**
 * The Ponder side of the shared derivation (AD-9). A Ponder log `event` exposes
 * `event.log` (only `{address, topics, data, logIndex}`), `event.block`, and
 * `event.transaction`; this adapter assembles the SAME declared `RawLog` shape
 * the `verify` `eth_getLogs` adapter builds, so the ONE shared `derive` yields a
 * byte-identical manifest from either source. JS `number` fields
 * (`logIndex`/`transactionIndex`) are converted to `bigint` at THIS boundary
 * (AD-2). Ponder is NOT on the verify path — this adapter feeds the accumulated
 * logs through `derive` only after historical sync completes (`/ready`).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-9]
 */
export type PonderLogEvent = {
  readonly log: {
    readonly address: `0x${string}`;
    readonly topics: readonly `0x${string}`[];
    readonly data: `0x${string}`;
    readonly logIndex: number;
  };
  readonly block: { readonly number: bigint; readonly hash: `0x${string}` };
  readonly transaction: { readonly transactionIndex: number; readonly hash: `0x${string}` };
};

export function ponderEventToRawLog(event: PonderLogEvent): RawLog {
  return {
    address: event.log.address.toLowerCase() as `0x${string}`,
    topics: event.log.topics,
    data: event.log.data,
    blockNumber: event.block.number,
    txIndex: BigInt(event.transaction.transactionIndex),
    logIndex: BigInt(event.log.logIndex),
    blockHash: event.block.hash.toLowerCase() as `0x${string}`,
    txHash: event.transaction.hash.toLowerCase() as `0x${string}`,
  };
}
