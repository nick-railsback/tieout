import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRateCurve, rateFromRebase, type RebaseObservation } from "../src/ratecurve.ts";

// T4 / AC-2.3.b — event-derived step-function rate curve (AD-6).

test("rateFromRebase reproduces the LIVE Note-1 gate value (real mainnet rebase)", () => {
  // Live-verified at rebaseBlock 25444795: stEthPerToken() == this exact value.
  assert.equal(rateFromRebase(9139519135144088574988460n, 7379813248156468402170827n), 1238448566083594004n);
});

test("multiply-before-divide with one truncating division (AD-2)", () => {
  // 3 * 1e18 / 2 = 1.5e18 exactly; 10 * 1e18 / 3 truncates toward zero.
  assert.equal(rateFromRebase(3n, 2n), 1500000000000000000n);
  assert.equal(rateFromRebase(10n, 3n), 3333333333333333333n);
});

function reb(block: bigint, ether: bigint, shares: bigint): RebaseObservation {
  return { rebaseBlock: block, postTotalEther: ether, postTotalShares: shares };
}

test("seeds from the last rebase <= startBlock, then carries in-window rebases", () => {
  const rebases = [
    reb(80n, 100n, 100n), // superseded pre-window
    reb(90n, 110n, 100n), // the seed (last <= startBlock=100)
    reb(150n, 120n, 100n), // in window
    reb(180n, 130n, 100n), // in window
    reb(250n, 140n, 100n), // after endBlock -> excluded
  ];
  const result = buildRateCurve(rebases, 100n, 200n);
  assert.ok(result.ok);
  assert.deepEqual(
    result.value.map((p) => p.rebaseBlock),
    [90n, 150n, 180n],
  );
  assert.equal(result.value[0]!.rate1e18, rateFromRebase(110n, 100n));
});

test("a rebase exactly at startBlock is the seed", () => {
  const result = buildRateCurve([reb(100n, 110n, 100n), reb(150n, 120n, 100n)], 100n, 200n);
  assert.ok(result.ok);
  assert.deepEqual(
    result.value.map((p) => p.rebaseBlock),
    [100n, 150n],
  );
});

test("D3: a slashing rebase (rate DECREASES) is carried, truncated toward zero", () => {
  const rebases = [
    reb(90n, 200n, 100n), // rate 2e18 (seed)
    reb(150n, 150n, 100n), // rate 1.5e18 — DECREASED (slashing)
  ];
  const result = buildRateCurve(rebases, 100n, 200n);
  assert.ok(result.ok);
  assert.equal(result.value[0]!.rate1e18, 2000000000000000000n);
  assert.equal(result.value[1]!.rate1e18, 1500000000000000000n);
  assert.ok(result.value[1]!.rate1e18 < result.value[0]!.rate1e18); // negative growth
});

test("dedups by block and emits strictly-increasing rebaseBlock (validateManifest-ready)", () => {
  const result = buildRateCurve(
    [reb(150n, 120n, 100n), reb(150n, 999n, 100n), reb(90n, 110n, 100n)],
    100n,
    200n,
  );
  assert.ok(result.ok);
  const blocks = result.value.map((p) => p.rebaseBlock);
  assert.deepEqual(blocks, [90n, 150n]);
  for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i - 1]! < blocks[i]!);
  assert.equal(result.value[1]!.rate1e18, rateFromRebase(120n, 100n)); // first delivery kept
});

test("rejects a zero-shares rebase loudly (never divides by zero)", () => {
  const result = buildRateCurve([reb(150n, 120n, 0n)], 100n, 200n);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "zero-shares");
});
