import { onchainTable } from "ponder";

/**
 * Accumulated normalized raw logs (AD-9 Ponder side). One row per log, keyed by
 * Ponder's stable `event.id` so re-runs on reorgs are idempotent (no
 * duplicates).
 *
 * Once implemented (deferred — see README, "Not yet implemented"), a read-back
 * after historical sync (`GET /ready` → 200) WILL feed these rows into the SAME
 * shared `derive` as the `verify` eth_getLogs adapter, yielding a byte-identical
 * manifest. That read-back does not exist yet: nothing reads `raw_log` back
 * today, so this table is write-only for now.
 */
export const rawLog = onchainTable("raw_log", (t) => ({
  id: t.text().primaryKey(),
  address: t.hex().notNull(),
  topics: t.hex().array().notNull(),
  data: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  txIndex: t.bigint().notNull(),
  logIndex: t.bigint().notNull(),
  blockHash: t.hex().notNull(),
  txHash: t.hex().notNull(),
}));
