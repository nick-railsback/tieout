import { ponder } from "ponder:registry";

/**
 * SCAFFOLD ONLY (Batch 1). Registers the block source declared in
 * ponder.config.ts so the `ponder:registry` virtual module and its event names
 * type-check. The handler is intentionally a no-op — the shared derivation
 * (raw logs → manifest, AD-9) lands in Batch 2 (Story 2.2).
 */
ponder.on("ChainMeta:block", async () => {
  // Batch 2: accumulate normalized logs into the manifest derivation here.
});
