import { createConfig } from "ponder";
import { http } from "viem";

/**
 * Ponder indexer configuration — SCAFFOLD ONLY (Batch 1).
 *
 * A single block-interval source proves the project resolves its peer deps
 * (hono/viem/typescript) and builds under the pinned stack, with NO indexing or
 * derivation logic. The shared raw-logs → manifest derivation adapter (AD-9) is
 * Batch 2 (Story 2.2).
 *
 * Operational note for later batches: the determinism harness (Batch 2, Story
 * 2.8) MUST run `ponder start` — never `ponder dev`, which drops and recreates
 * tables and disables crash recovery.
 * [ponder@0.16.6 packages/core/src/bin/commands/dev.ts#L28-L100]
 */
export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: http(process.env.PONDER_RPC_URL_1),
    },
  },
  blocks: {
    ChainMeta: {
      chain: "mainnet",
      startBlock: 21_000_000,
      interval: 100_000,
    },
  },
});
