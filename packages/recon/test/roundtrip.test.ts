import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalize } from "../src/canonical.ts";
import { validateLedger } from "../src/ledger.ts";
import { validateManifest } from "../src/manifest.ts";
import { canonicalReport, recon, type Report } from "../src/recon.ts";
import { parseReportJson } from "../src/report-json.ts";

// Health-audit Testing finding: parseReportJson hand-re-declares the entire
// report shape (parsePins/parseAxis/parseLot/parseDiscrepancy/parseValuation).
// When the envelope grows a field — as it did with `valuation` — canonicalReport
// and parseReportJson must change in tandem; miss one and the web renders a
// report with a silently dropped field WHILE THE HASH STILL VERIFIES: a gap
// between what-was-hashed and what-is-shown. This binds the two as exact
// inverses over the real fixtures, so any future field drift fails loudly here.

const RECON = join(import.meta.dirname, "..");

function goldenLikeReport(dir: string): Report {
  const base = join(RECON, "fixtures", dir);
  const manifest = validateManifest(JSON.parse(readFileSync(join(base, "manifest.json"), "utf8")));
  const ledger = validateLedger(JSON.parse(readFileSync(join(base, "ledger.json"), "utf8")));
  assert.ok(manifest.ok && ledger.ok, `${dir} fixtures must validate`);
  if (!manifest.ok || !ledger.ok) throw new Error("unreachable");
  const result = recon(manifest.value, ledger.value);
  assert.ok(result.ok, `${dir} recon must succeed`);
  if (!result.ok) throw new Error("unreachable");
  return result.value.report;
}

for (const dir of ["golden", "slice"]) {
  test(`parseReportJson is the exact inverse of canonicalReport (${dir})`, () => {
    const report = goldenLikeReport(dir);
    // The exact path the web takes: canonical bytes on disk -> JSON.parse -> hydrate.
    const onDisk = JSON.parse(canonicalize(canonicalReport(report)));
    const roundTripped = parseReportJson(onDisk);
    assert.deepEqual(roundTripped, report);
  });
}
