import assert from "node:assert/strict";
import { test } from "node:test";
import { SLICE_START_BLOCK, SLICE_END_BLOCK } from "../src/slice.ts";
import * as pkg from "../src/index.ts";

// Health-audit DRY finding: the pinned slice block range was a magic literal
// duplicated across the indexer and the pin-slice bin. It now has one home; this
// test pins the load-bearing numbers and confirms the package re-exports them so
// both consumers read the same source.

test("the pinned slice range is a well-formed bigint window", () => {
  assert.equal(typeof SLICE_START_BLOCK, "bigint");
  assert.equal(typeof SLICE_END_BLOCK, "bigint");
  assert.ok(SLICE_END_BLOCK > SLICE_START_BLOCK);
  // The Batch 2 discrepancy slice (Story 2.8) — the exact window the golden
  // fixture and the parity test are pinned to.
  assert.equal(SLICE_START_BLOCK, 25_444_667n);
  assert.equal(SLICE_END_BLOCK, 25_444_922n);
});

test("the slice range is on the package public surface", () => {
  assert.equal(pkg.SLICE_START_BLOCK, SLICE_START_BLOCK);
  assert.equal(pkg.SLICE_END_BLOCK, SLICE_END_BLOCK);
});
