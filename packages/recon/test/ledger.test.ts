import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ledgerHash, validateLedger } from "../src/ledger.ts";

// T4 / AC-1.2 — fixed ledger input schema + validator + ledgerHash.

function validLedger(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    subject: "0xda7a000000000000000000000000000000000000",
    asset: "wstETH",
    window: { startBlock: "21000000", endBlock: "21100000" },
    lots: [
      { lotId: "L1", acquisitionBlock: "21010000", shares: "100000000000000000000", costBasisUsd: "250000000000" },
      { lotId: "L2", acquisitionBlock: "21060000", shares: "50000000000000000000", costBasisUsd: "130000000000" },
    ],
    bookedReward: "1000000000000000000",
  };
}

/** Assert the validator rejects `input` with the expected error code. */
function expectReject(input: unknown, code: string): void {
  const result = validateLedger(input);
  assert.equal(result.ok, false, `expected rejection with code "${code}"`);
  if (!result.ok) assert.equal(result.error.code, code);
}

test("accepts a well-formed ledger (AC-1.2.a)", () => {
  const result = validateLedger(validLedger());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.subject, "0xda7a000000000000000000000000000000000000");
    assert.equal(result.value.lots.length, 2);
    assert.equal(result.value.lots[0]!.shares, 100_000_000_000_000_000_000n);
  }
});

test("rejects a duplicate lotId (AC-1.2.b)", () => {
  const bad = validLedger();
  (bad["lots"] as Array<Record<string, unknown>>)[1]!["lotId"] = "L1";
  expectReject(bad, "duplicate-lot");
});

test("rejects a non-lowercase subject (AC-1.2.b)", () => {
  const bad = validLedger();
  bad["subject"] = "0xDa7A000000000000000000000000000000000000";
  expectReject(bad, "bad-address");
});

test("rejects a float (AC-1.2.b)", () => {
  const bad = validLedger();
  (bad["lots"] as Array<Record<string, unknown>>)[0]!["shares"] = "1.5";
  expectReject(bad, "not-decimal-string");
});

test("rejects a JSON-number integer — integers must be decimal strings (AC-1.2.b)", () => {
  const bad = validLedger();
  (bad["lots"] as Array<Record<string, unknown>>)[0]!["shares"] = 100;
  expectReject(bad, "json-number-integer");
});

test("rejects a lot acquired after the window closes (AC-1.2.b)", () => {
  const bad = validLedger();
  (bad["lots"] as Array<Record<string, unknown>>)[1]!["acquisitionBlock"] = "21100001";
  expectReject(bad, "acquisition-after-window");
});

test("rejects lots not ordered by (acquisitionBlock, lotId) (AC-1.2.b, AD-4)", () => {
  const bad = validLedger();
  const lots = bad["lots"] as Array<Record<string, unknown>>;
  [lots[0], lots[1]] = [lots[1]!, lots[0]!];
  expectReject(bad, "lot-order");
});

test("ledgerHash is stable and independent of input key order (AC-1.2.c)", () => {
  const base = validateLedger(validLedger());
  assert.equal(base.ok, true);

  const shuffled = {
    bookedReward: "1000000000000000000",
    lots: [
      { costBasisUsd: "250000000000", shares: "100000000000000000000", acquisitionBlock: "21010000", lotId: "L1" },
      { shares: "50000000000000000000", lotId: "L2", costBasisUsd: "130000000000", acquisitionBlock: "21060000" },
    ],
    window: { endBlock: "21100000", startBlock: "21000000" },
    asset: "wstETH",
    subject: "0xda7a000000000000000000000000000000000000",
    schemaVersion: "1",
  };
  const other = validateLedger(shuffled);
  assert.equal(other.ok, true);
  if (base.ok && other.ok) assert.equal(ledgerHash(base.value), ledgerHash(other.value));
});

test("ledgerHash matches the committed golden ledger", () => {
  const raw: unknown = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "fixtures", "golden", "ledger.json"), "utf8"),
  );
  const result = validateLedger(raw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      ledgerHash(result.value),
      "0x55da992a645ab89b3d9844b39ff7b4aac82d6ddfb83eb3807dad17941f2a8991",
    );
  }
});
