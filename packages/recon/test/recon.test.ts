import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { validateLedger } from "../src/ledger.ts";
import {
  type Manifest,
  type TransferEvent,
  manifestHash,
  validateManifest,
} from "../src/manifest.ts";
import { recon } from "../src/recon.ts";

const GOLDEN = join(import.meta.dirname, "..", "fixtures", "golden");

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(GOLDEN, name), "utf8"));
}

function goldenManifest(): Manifest {
  const result = validateManifest(loadJson("manifest.json"));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

// --- T5 / AC-1.4 — manifest input-contract + total-order validation ---

test("accepts the golden manifest; manifestHash matches the committed value", () => {
  const manifest = goldenManifest();
  assert.equal(
    manifestHash(manifest),
    "0x9be3885fb36f81eed42adcc14a72b8d913dcdf7017977faea5cc391703d87cab",
  );
});

test("rejects events not ordered by (blockNumber, txIndex, logIndex) (AC-1.4.b, AD-4)", () => {
  const bad = loadJson("manifest.json") as Record<string, unknown>;
  const events = bad["events"] as unknown[];
  [events[0], events[2]] = [events[2]!, events[0]!];
  const result = validateManifest(bad);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "event-order");
});

test("rejects an event missing txHash — a pure core cannot derive it (AD-7)", () => {
  const bad = loadJson("manifest.json") as Record<string, unknown>;
  const event0 = (bad["events"] as Array<Record<string, unknown>>)[0]!;
  delete event0["txHash"];
  const result = validateManifest(bad);
  assert.equal(result.ok, false);
});

test("rejects a JSON-number integer in the manifest (AD-11)", () => {
  const bad = loadJson("manifest.json") as Record<string, unknown>;
  bad["startBlock"] = 21_000_000;
  const result = validateManifest(bad);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "json-number-integer");
});

// --- T6 / AC-1.5 — the pure recon engine ---

test("reconciles both axes: shares tie out, reward breaks by the injected delta", () => {
  const manifest = goldenManifest();
  const ledgerResult = validateLedger(loadJson("ledger.json"));
  assert.equal(ledgerResult.ok, true);
  if (!ledgerResult.ok) return;

  const result = recon(manifest, ledgerResult.value);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { report } = result.value;

  // Closing-shares axis ties out (AC-1.5.b).
  assert.equal(report.axes.closingShares.tieOut, true);
  assert.equal(report.axes.closingShares.delta, 0n);
  assert.equal(report.axes.closingShares.onchain, 150_000_000_000_000_000_000n);

  // Reward axis breaks — the injected discrepancy (AD-20).
  assert.equal(report.axes.reward.tieOut, false);
  assert.equal(report.axes.reward.onchain, 1_500_000_000_000_000_000n);
  assert.equal(report.axes.reward.delta, 500_000_000_000_000_000n);

  // The discrepancy names its exact breaking event (AC-1.5.c).
  assert.equal(report.discrepancies.length, 1);
  const discrepancy = report.discrepancies[0]!;
  assert.equal(discrepancy.axis, "reward");
  assert.equal(discrepancy.breakingEvent?.blockNumber, 21_099_000n);
  assert.equal(discrepancy.breakingEvent?.logIndex, 0n);
  assert.equal(
    discrepancy.breakingEvent?.txHash,
    "0xa4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4",
  );

  // Report embeds hashes, engineVersion, and the pinned endpoints (AC-1.5.c).
  assert.equal(report.engineVersion, "0.2.0");
  assert.equal(report.pins.startBlock, 21_000_000n);
  assert.equal(report.pins.endBlock, 21_100_000n);
  assert.match(report.manifestHash, /^0x[0-9a-f]{64}$/);
  assert.match(report.ledgerHash, /^0x[0-9a-f]{64}$/);

  // Per-lot records ordered by (acquisitionBlock, lotId) (AC-1.5.c, AD-13).
  assert.deepEqual(
    report.lots.map((l) => l.lotId),
    ["L1", "L2"],
  );
});

// Health-audit Security finding (SEC-2): recon() summed Transfer.value into
// onchainShares WITHOUT checking event.address, while derive validates the
// emitter. A hand-authored, validator-passing manifest could inject a Transfer
// from an arbitrary contract to the subject and inflate the tie-out base. recon
// must resolve wstETH from the manifest's own addressTable and ignore foreign
// emitters (defense-in-depth: the trustless verify path also re-derives).
test("SEC-2: a Transfer from a non-wstETH emitter is not counted into onchainShares", () => {
  const manifest = goldenManifest();
  const ledgerResult = validateLedger(loadJson("ledger.json"));
  assert.ok(ledgerResult.ok);
  if (!ledgerResult.ok) return;
  const ledger = ledgerResult.value;

  const clean = recon(manifest, ledger);
  assert.ok(clean.ok);
  if (!clean.ok) return;

  // Forge a large Transfer TO the subject from a NON-wstETH contract, in-window.
  const forged: TransferEvent = {
    type: "Transfer",
    address: "0x000000000000000000000000000000000000dead",
    blockNumber: manifest.startBlock + 1n,
    txIndex: 0n,
    logIndex: 0n,
    blockHash: `0x${"ab".repeat(32)}`,
    txHash: `0x${"cd".repeat(32)}`,
    from: "0x0000000000000000000000000000000000000000",
    to: ledger.subject,
    value: 999_000_000_000_000_000_000n,
  };
  const tampered: Manifest = { ...manifest, events: [...manifest.events, forged] };

  const got = recon(tampered, ledger);
  assert.ok(got.ok);
  if (!got.ok) return;
  // The forged emitter must NOT move the closing-shares base.
  assert.equal(
    got.value.report.axes.closingShares.onchain,
    clean.value.report.axes.closingShares.onchain,
  );
});

test("returns a typed window-mismatch error — never throws across the boundary (AC-1.2.b)", () => {
  const manifest = goldenManifest();
  const badLedger = loadJson("ledger.json") as Record<string, unknown>;
  (badLedger["window"] as Record<string, unknown>)["endBlock"] = "21099999";
  const ledgerResult = validateLedger(badLedger);
  assert.equal(ledgerResult.ok, true);
  if (!ledgerResult.ok) return;

  const result = recon(manifest, ledgerResult.value);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "window-mismatch");
});

test("returns a typed version-skew error when the manifest engineVersion drifts (AD-8)", () => {
  const raw = loadJson("manifest.json") as Record<string, unknown>;
  raw["engineVersion"] = "0.0.1";
  const manifestResult = validateManifest(raw);
  assert.equal(manifestResult.ok, true);
  if (!manifestResult.ok) return;
  const ledgerResult = validateLedger(loadJson("ledger.json"));
  assert.equal(ledgerResult.ok, true);
  if (!ledgerResult.ok) return;

  const result = recon(manifestResult.value, ledgerResult.value);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "version-skew");
});

// Code-review 2026-07-07, finding #1 (CONFIRMED): the reward axis credits the
// FULL-WINDOW rate growth (rateEnd − rateStart) to the closing share balance
// with NO per-lot proration (recon.ts). Under the AD-20 window contract every
// lot is acquired in-window, so a lot bought AFTER the window's only rebase
// earned nothing from it — yet the engine still credits it the full growth,
// producing a reward figure honest books (booking 0) will not match. This is a
// KNOWN v0.1.0 coarse-formula simplification, faithful to the AD-20 / spine
// reward-axis definition ("chain rate-curve growth vs bookedReward") and to the
// golden's `bookedReward`; the resolution was to DOCUMENT it (recon.ts reward
// comment + deferred-work.md), not to change the hash-bearing math. This test
// PINS the coarse behavior so any future move to proration is a deliberate,
// engineVersion-bumped decision — never silent drift.
test("known v0.1.0 simplification: reward credits full-window growth to post-rebase shares (review #1)", () => {
  const rawManifest = loadJson("manifest.json") as Record<string, unknown>;
  // A single in-window rate step 1.0 → 1.1 at block 21050000, seeded at 1.0 so
  // rateAt(startBlock) = 1.0e18 and rateAt(endBlock) = 1.1e18.
  rawManifest["rateCurve"] = [
    { rebaseBlock: "20999000", rate1e18: "1000000000000000000" },
    { rebaseBlock: "21050000", rate1e18: "1100000000000000000" },
  ];
  // The subject's ONLY wstETH acquisition is at block 21060000 — strictly AFTER
  // the only rebase (21050000), so economically it earned zero in-window reward.
  rawManifest["events"] = [
    {
      type: "Transfer",
      address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
      blockNumber: "21060000",
      txIndex: "5",
      logIndex: "9",
      blockHash: `0x${"b3".repeat(32)}`,
      txHash: `0x${"a3".repeat(32)}`,
      from: "0x2222222222222222222222222222222222222222",
      to: "0xda7a000000000000000000000000000000000000",
      value: "100000000000000000000",
    },
  ];
  const manifestResult = validateManifest(rawManifest);
  assert.ok(manifestResult.ok);
  if (!manifestResult.ok) return;

  const rawLedger = loadJson("ledger.json") as Record<string, unknown>;
  rawLedger["lots"] = [
    {
      lotId: "L1",
      acquisitionBlock: "21060000",
      shares: "100000000000000000000",
      costBasisUsd: "250000000000",
    },
  ];
  // Honest books: the shares were bought after the only rebase → 0 reward.
  rawLedger["bookedReward"] = "0";
  const ledgerResult = validateLedger(rawLedger);
  assert.ok(ledgerResult.ok);
  if (!ledgerResult.ok) return;

  const result = recon(manifestResult.value, ledgerResult.value);
  assert.ok(result.ok);
  if (!result.ok) return;
  const { reward } = result.value.report.axes;

  // rateGrowth = 1.1e18 − 1.0e18 = 1e17; onchainShares = 100e18.
  // onchainReward = 100e18 * 1e17 / 1e18 = 10e18 — the full-window credit, applied
  // in full even though the shares post-date the only rebase (the KNOWN coarse
  // behavior this finding named).
  assert.equal(reward.onchain, 10_000_000_000_000_000_000n);
  // Against honest books (bookedReward 0) that surfaces a FALSE +10e18 reward
  // discrepancy — documented as a v0.1.0 simplification, not treated as a defect.
  assert.equal(reward.ledger, 0n);
  assert.equal(reward.delta, 10_000_000_000_000_000_000n);
  assert.equal(reward.tieOut, false);
});
