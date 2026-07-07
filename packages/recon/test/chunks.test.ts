import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkRange } from "../src/chunks.ts";

// T7 / AC-2.6.c — deterministic chunking; boundaries from pins only.

test("a single-block range yields one chunk", () => {
  assert.deepEqual(chunkRange(100n, 100n, 10n), [{ fromBlock: 100n, toBlock: 100n }]);
});

test("an exact multiple splits into equal chunks", () => {
  assert.deepEqual(chunkRange(100n, 129n, 10n), [
    { fromBlock: 100n, toBlock: 109n },
    { fromBlock: 110n, toBlock: 119n },
    { fromBlock: 120n, toBlock: 129n },
  ]);
});

test("a partial final chunk is clamped to endBlock", () => {
  assert.deepEqual(chunkRange(100n, 125n, 10n), [
    { fromBlock: 100n, toBlock: 109n },
    { fromBlock: 110n, toBlock: 119n },
    { fromBlock: 120n, toBlock: 125n },
  ]);
});

test("chunks are gap-free, non-overlapping, and cover [start, end] inclusive", () => {
  const chunks = chunkRange(25444796n, 25445051n, 9n); // the real slice, free-tier chunk
  assert.equal(chunks[0]!.fromBlock, 25444796n);
  assert.equal(chunks[chunks.length - 1]!.toBlock, 25445051n);
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(chunks[i]!.fromBlock, chunks[i - 1]!.toBlock + 1n); // contiguous
  }
  for (const c of chunks) assert.ok(c.toBlock - c.fromBlock + 1n <= 9n); // within the cap
});

test("is a pure function of its arguments (deterministic)", () => {
  assert.deepEqual(chunkRange(1n, 100n, 7n), chunkRange(1n, 100n, 7n));
});

test("rejects a non-positive chunk size; empty range yields no chunks", () => {
  assert.throws(() => chunkRange(1n, 10n, 0n), /blocksPerChunk/);
  assert.deepEqual(chunkRange(10n, 5n, 3n), []);
});
