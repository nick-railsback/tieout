import { onchainTable } from "ponder";

/**
 * SCAFFOLD ONLY (Batch 1). A placeholder table so the schema compiles under the
 * pinned stack. The real derivation tables (raw logs → normalized events →
 * manifest inputs) arrive in Batch 2.
 */
export const chainMeta = onchainTable("chain_meta", (t) => ({
  block: t.bigint().primaryKey(),
}));
