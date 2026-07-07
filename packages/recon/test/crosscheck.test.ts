import assert from "node:assert/strict";
import { test } from "node:test";
import { crossCheckRate, crossCheckRates } from "../src/crosscheck.ts";

// T5 / AC-2.4.a — exact-equality rate cross-check (AD-6/FR7): never a tolerance.

test("passes when event-derived and archive rates are EXACTLY equal (real Note-1 value)", () => {
  const result = crossCheckRate({
    rebaseBlock: 25444795n,
    eventRate1e18: 1238448566083594004n, // TokenRebased-derived
    archiveRate1e18: 1238448566083594004n, // stEthPerToken()@block
  });
  assert.ok(result.ok);
  assert.equal(result.value, 1238448566083594004n);
});

test("fails on a divergence of even ONE wei — never a silent tolerance (FR7)", () => {
  const result = crossCheckRate({
    rebaseBlock: 25444795n,
    eventRate1e18: 1238448566083594004n,
    archiveRate1e18: 1238448566083594005n, // off by 1 wei
  });
  assert.ok(!result.ok);
  assert.equal(result.error.rebaseBlock, 25444795n);
  assert.equal(result.error.eventRate1e18, 1238448566083594004n);
  assert.equal(result.error.archiveRate1e18, 1238448566083594005n);
});

test("crossCheckRates confirms all rates when every observation agrees", () => {
  const result = crossCheckRates([
    {
      rebaseBlock: 90n,
      eventRate1e18: 2000000000000000000n,
      archiveRate1e18: 2000000000000000000n,
    },
    {
      rebaseBlock: 150n,
      eventRate1e18: 1500000000000000000n,
      archiveRate1e18: 1500000000000000000n,
    },
  ]);
  assert.ok(result.ok);
  assert.deepEqual(result.value, [2000000000000000000n, 1500000000000000000n]);
});

test("crossCheckRates surfaces the FIRST divergence and stops", () => {
  const result = crossCheckRates([
    { rebaseBlock: 90n, eventRate1e18: 2n, archiveRate1e18: 2n },
    { rebaseBlock: 150n, eventRate1e18: 3n, archiveRate1e18: 4n }, // diverges
    { rebaseBlock: 180n, eventRate1e18: 5n, archiveRate1e18: 5n },
  ]);
  assert.ok(!result.ok);
  assert.equal(result.error.rebaseBlock, 150n);
});
