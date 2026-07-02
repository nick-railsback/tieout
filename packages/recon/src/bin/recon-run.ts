import { readFileSync, writeFileSync } from "node:fs";
import { canonicalBytes } from "../canonical.ts";
import { validateLedger } from "../ledger.ts";
import { validateManifest } from "../manifest.ts";
import { canonicalReport, recon } from "../recon.ts";

/**
 * Fresh-process reconciliation runner. Reads a `(manifest, ledger)` fixture
 * pair, runs the pure {@link recon} core, optionally writes the byte-exact
 * `report.json`, and prints `reportHash` as the sole stdout line.
 *
 * This is what the determinism proof spawns as an independent OS process
 * (AC-1.6.a): "across a fresh process" is only meaningful if a real second
 * process reproduces the byte-identical report and hash.
 *
 *   node src/bin/recon-run.ts <manifest.json> <ledger.json> [out/report.json]
 *
 * The core is pure; the only effects — reading fixtures, writing the report —
 * live here in the shell (AD-1).
 */
type ReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/** Read + parse a JSON file, returning a typed result instead of throwing — so
 * I/O and parse errors follow the same clean error contract as validation
 * failures (the shell owns error surfacing and exit codes; AD-1). */
function readJson(path: string): ReadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (caught) {
    return { ok: false, message: `cannot read ${path}: ${(caught as Error).message}` };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (caught) {
    return { ok: false, message: `invalid JSON in ${path}: ${(caught as Error).message}` };
  }
}

function main(): number {
  const [manifestPath, ledgerPath, outPath] = process.argv.slice(2);
  if (manifestPath === undefined || ledgerPath === undefined) {
    process.stderr.write("usage: recon-run <manifest.json> <ledger.json> [out/report.json]\n");
    return 2;
  }

  const manifestRead = readJson(manifestPath);
  if (!manifestRead.ok) {
    process.stderr.write(`${manifestRead.message}\n`);
    return 1;
  }
  const ledgerRead = readJson(ledgerPath);
  if (!ledgerRead.ok) {
    process.stderr.write(`${ledgerRead.message}\n`);
    return 1;
  }

  const manifest = validateManifest(manifestRead.value);
  if (!manifest.ok) {
    process.stderr.write(`manifest invalid: [${manifest.error.code}] ${manifest.error.message}\n`);
    return 1;
  }
  const ledger = validateLedger(ledgerRead.value);
  if (!ledger.ok) {
    process.stderr.write(`ledger invalid: [${ledger.error.code}] ${ledger.error.message}\n`);
    return 1;
  }

  const result = recon(manifest.value, ledger.value);
  if (!result.ok) {
    process.stderr.write(`recon failed: [${result.error.code}] ${result.error.message}\n`);
    return 1;
  }

  if (outPath !== undefined) {
    // Write the EXACT canonical bytes that were hashed — no re-stringify, no
    // trailing newline (AD-11, AC-1.3.d).
    try {
      writeFileSync(outPath, canonicalBytes(canonicalReport(result.value.report)));
    } catch (caught) {
      process.stderr.write(`cannot write ${outPath}: ${(caught as Error).message}\n`);
      return 1;
    }
  }

  process.stdout.write(`${result.value.reportHash}\n`);
  return 0;
}

process.exit(main());
