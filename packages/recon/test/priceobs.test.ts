import assert from "node:assert/strict";
import { test } from "node:test";
import { guardPriceRound, toPriceObservation, type PriceRound } from "../src/priceobs.ts";

// T6 / AC-2.5.a-b — AD-18 price-observation guards (Note-4 resolved live).

const REAL: PriceRound = {
  roundId: 36893488147419123409n,
  answer: 166119580394n,
  updatedAt: 1782995435n,
  decimals: 8n,
};
const END_TS = 1782997991n; // pinned endBlock 25445051 timestamp

test("accepts the real Note-4 stETH/USD round at the pinned endBlock", () => {
  const result = guardPriceRound(REAL, END_TS);
  assert.ok(result.ok);
});

test("rejects a non-positive answer (dead/invalid feed)", () => {
  const result = guardPriceRound({ ...REAL, answer: 0n }, END_TS);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "non-positive-answer");
});

test("rejects a round updated AFTER endBlock (never a future round)", () => {
  const result = guardPriceRound({ ...REAL, updatedAt: END_TS + 1n }, END_TS);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "future-update");
});

test("rejects a stale round beyond the bounded staleness window", () => {
  const result = guardPriceRound({ ...REAL, updatedAt: END_TS - 100_000n }, END_TS);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "stale");
});

test("toPriceObservation builds the manifest slot with a lowercased feed", () => {
  const obs = toPriceObservation("0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8", REAL, 25445051n);
  assert.equal(obs.feedAddress, "0xcfe54b5cd566ab89272946f602d76ea879cab4a8");
  assert.equal(obs.roundId, 36893488147419123409n);
  assert.equal(obs.answer, 166119580394n);
  assert.equal(obs.decimals, 8n);
  assert.equal(obs.observedBlock, 25445051n);
});
