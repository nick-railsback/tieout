import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { validateLedger } from "../src/ledger.ts";
import { type Manifest, manifestHash, validateManifest } from "../src/manifest.ts";
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
    "0xa9fa6392e21d2e0435d470d62fdff8a096514039acca4471e37a9f991cfb03cb",
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
  assert.equal(report.engineVersion, "0.1.0");
  assert.equal(report.pins.startBlock, 21_000_000n);
  assert.equal(report.pins.endBlock, 21_100_000n);
  assert.match(report.manifestHash, /^0x[0-9a-f]{64}$/);
  assert.match(report.ledgerHash, /^0x[0-9a-f]{64}$/);

  // Per-lot records ordered by (acquisitionBlock, lotId) (AC-1.5.c, AD-13).
  assert.deepEqual(report.lots.map((l) => l.lotId), ["L1", "L2"]);
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
