/**
 * Deterministic chunking of the pinned range for the L0 `eth_getLogs` re-fetch
 * (AC-2.6.c). Providers cap `eth_getLogs` block spans (the free Alchemy tier at
 * ~10 blocks; the 30-day mainnet window is ~216k blocks), so the re-fetch must
 * chunk — but the chunk boundaries derive ONLY from the pins and a fixed chunk
 * size, NEVER from provider responses. Chunk size does not affect the derived
 * manifest (the derivation dedups + totally orders), so it is a pure
 * fetch/reliability knob, not a determinism one — two runners may use different
 * chunk sizes and still reproduce a byte-identical manifest.
 */

export type BlockChunk = { readonly fromBlock: bigint; readonly toBlock: bigint };

/**
 * Split `[startBlock, endBlock]` (both inclusive) into consecutive chunks of at
 * most `blocksPerChunk` blocks each, gap-free and non-overlapping. Purely a
 * function of the three arguments.
 */
export function chunkRange(
  startBlock: bigint,
  endBlock: bigint,
  blocksPerChunk: bigint,
): BlockChunk[] {
  if (blocksPerChunk < 1n) throw new RangeError("blocksPerChunk must be >= 1");
  if (endBlock < startBlock) return [];
  const chunks: BlockChunk[] = [];
  for (let from = startBlock; from <= endBlock; from += blocksPerChunk) {
    const last = from + blocksPerChunk - 1n;
    chunks.push({ fromBlock: from, toBlock: last > endBlock ? endBlock : last });
  }
  return chunks;
}
