import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalize } from "../src/canonical.ts";
import { type Ledger, validateLedger } from "../src/ledger.ts";
import { type Manifest, canonicalManifest, manifestHash, validateManifest } from "../src/manifest.ts";
import { type Report, recon } from "../src/recon.ts";

// T4 / AC-4.1, AC-4.2 — USD valuation + unrealized P/L (AD-18 consumption, AD-2).
//
// The dollar figures derive ONLY from the block-pinned price observation carried
// in the hashed manifest — no `latest`, no DEX spot — and must reproduce
// byte-for-byte. These assertions pin the worked golden example and prove the
// figure is a pure function of the pinned round.

const GOLDEN = join(import.meta.dirname, "..", "fixtures", "golden");

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(GOLDEN, name), "utf8"));
}

function goldenManifest(): Manifest {
  const result = validateManifest(loadJson("manifest.json"));
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

function goldenLedger(): Ledger {
  const result = validateLedger(loadJson("ledger.json"));
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

function reconOrThrow(manifest: Manifest, ledger: Ledger): Report {
  const result = recon(manifest, ledger);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  return result.value.report;
}

test("AC-4.1.a/b — currentValueUsd + unrealizedPnl match the worked golden example", () => {
  const v = reconOrThrow(goldenManifest(), goldenLedger()).valuation;
  // (150e18 · 1.19e18 · 3e11 · 1e6) / (1e18 · 1e18 · 1e8) = 535500000000, EXACT
  // — one truncating division (AD-2), feed decimals (8) read from the manifest.
  assert.equal(v.currentValueUsd, 535_500_000_000n); // $535,500.000000
  assert.equal(v.costBasisUsd, 380_000_000_000n); // Σ costBasisUsd = $250k + $130k
  assert.equal(v.unrealizedPnl, 155_500_000_000n); // $155,500.000000 (subtraction only)
  assert.equal(v.usdDecimals, 6n); // declared micro-USD report scale (AD-20)
  // Provenance actually used — read from the pinned observation, never assumed.
  assert.equal(v.sharesValued, 150_000_000_000_000_000_000n); // onchainShares (AD-16)
  assert.equal(v.rate1e18, 1_190_000_000_000_000_000n); // reused reward-axis rateEnd
  assert.equal(v.answer, 300_000_000_000n);
  assert.equal(v.priceDecimals, 8n); // feed-native, from the manifest (AD-18)
});

test("AC-4.1.b — a cheaper pinned round makes unrealizedPnl negative and serializes signed", () => {
  const raw = loadJson("manifest.json") as Record<string, unknown>;
  (raw["priceObservation"] as Record<string, unknown>)["answer"] = "200000000000"; // cheaper round
  const manifest = validateManifest(raw);
  assert.ok(manifest.ok);
  if (!manifest.ok) return;

  const v = reconOrThrow(manifest.value, goldenLedger()).valuation;
  assert.equal(v.currentValueUsd, 357_000_000_000n); // 1.785 · 2e11, exact
  assert.equal(v.unrealizedPnl, -23_000_000_000n); // 357e9 − 380e9 < 0
  // The one canonicalizer emits a negative bigint as a signed decimal string.
  assert.equal(canonicalize(v.unrealizedPnl), '"-23000000000"');
});

test("AC-4.2.a/b — currentValueUsd is a pure function of the pinned round (no latest, no DEX)", () => {
  // Same inputs, two runs → identical figure (determinism). This alone proves
  // determinism, NOT the absence of a live feed; the round-substitution case
  // below + the pure core's no-I/O construction (AD-1) carry the "no latest".
  const a = reconOrThrow(goldenManifest(), goldenLedger()).valuation.currentValueUsd;
  const b = reconOrThrow(goldenManifest(), goldenLedger()).valuation.currentValueUsd;
  assert.equal(a, b);
  assert.equal(a, 535_500_000_000n);

  // Substituting a DIFFERENT pinned round (roundId + answer) changes the figure
  // deterministically — proving it derives from the pinned observation, not a
  // live feed. The pure core (AD-1) has no I/O and cannot read `latest`.
  const raw = loadJson("manifest.json") as Record<string, unknown>;
  const price = raw["priceObservation"] as Record<string, unknown>;
  price["roundId"] = "18446744073709551800";
  price["answer"] = "200000000000";
  const substituted = validateManifest(raw);
  assert.ok(substituted.ok);
  if (!substituted.ok) return;

  const v = reconOrThrow(substituted.value, goldenLedger()).valuation;
  assert.equal(v.currentValueUsd, 357_000_000_000n); // deterministically different
  assert.equal(v.roundId, 18_446_744_073_709_551_800n); // provenance tracks the round
  assert.equal(v.answer, 200_000_000_000n);
});

test("AC-4.2.b — the USD addition grows the report, not the manifest: manifestHash unchanged", () => {
  const manifest = goldenManifest();
  // The current committed manifestHash (0.2.0 fingerprint). It moved vs Batch 1
  // ONLY because engineVersion (a manifest field) bumped — NOT because any
  // USD/valuation field entered the manifest; the includes-checks below prove
  // the figures still live in the report, not the manifest.
  assert.equal(
    manifestHash(manifest),
    "0x9be3885fb36f81eed42adcc14a72b8d913dcdf7017977faea5cc391703d87cab",
  );
  const manifestJson = canonicalize(canonicalManifest(manifest));
  assert.ok(!manifestJson.includes("valuation"), "manifest must carry no valuation field");
  assert.ok(!manifestJson.includes("currentValueUsd"), "manifest must carry no USD field");

  // ...while the report DID gain a populated valuation object (concrete fields,
  // not just presence).
  const report = reconOrThrow(manifest, goldenLedger());
  assert.equal(report.valuation.currentValueUsd, 535_500_000_000n);
  assert.equal(report.valuation.usdDecimals, 6n);
});

test("review follow-up (AD-18 guard) — recon rejects an out-of-range priceObservation.decimals", () => {
  const raw = loadJson("manifest.json") as Record<string, unknown>;
  // `parseNonNegInt` bounds `decimals` below but not above, so this passes
  // manifest validation — the guard must live in recon, before `10n ** decimals`.
  (raw["priceObservation"] as Record<string, unknown>)["decimals"] = "1000000000000";
  const manifest = validateManifest(raw);
  assert.ok(manifest.ok);
  if (!manifest.ok) return;

  const result = recon(manifest.value, goldenLedger());
  assert.equal(result.ok, false); // typed error, never a hang and never a throw
  if (!result.ok) assert.equal(result.error.code, "price-decimals-out-of-range");
});
