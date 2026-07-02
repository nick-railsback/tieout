import { type Hex } from "viem";

/**
 * The normalized raw-log record that feeds the shared derivation (AD-9). Both
 * the `verify` `eth_getLogs` adapter and the Ponder live adapter assemble this
 * exact shape, so one derivation produces byte-identical manifests from either.
 *
 * `txHash` is REQUIRED even though it is not needed to *decode* the log: the
 * manifest's `EventBase` carries `txHash` on every event (a pure core cannot
 * derive it from `txIndex` — AD-7), so it must arrive with the raw log. Both
 * adapters have it: `eth_getLogs` returns `transactionHash`; Ponder exposes
 * `event.transaction.hash`. (Reconciles the story's `RawLog` field list, which
 * omits `txHash` in one place while the frozen manifest requires it.)
 *
 * Every integer is a `bigint`: any client that hands back a JS `number` for
 * `logIndex`/`transactionIndex`/`blockNumber` is converted to `bigint` at the
 * adapter boundary before a RawLog is built (AD-2).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-9]
 */
export type RawLog = {
  readonly address: `0x${string}`;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint;
  readonly txIndex: bigint;
  readonly logIndex: bigint;
  readonly blockHash: `0x${string}`;
  readonly txHash: `0x${string}`;
};
