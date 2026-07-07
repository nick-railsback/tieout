import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalBytes, canonicalHash } from "../src/canonical.ts";
import { validateLedger } from "../src/ledger.ts";
import { type Manifest, validateManifest } from "../src/manifest.ts";
import { type Ledger } from "../src/ledger.ts";
import { type Report, canonicalReport, recon } from "../src/recon.ts";

// T7 / AC-1.6 — golden determinism proof (core-level NFR-0).
//
// NFR-0: the same (manifest, ledger) inputs must produce a byte-identical
// reportHash on two independent machines. Batch 1 proves it at the core level
// (one machine, repeated + fresh-process runs); the cross-machine harness is
// Batch 2 (Story 2.8).

const ROOT = join(import.meta.dirname, "..");
const GOLDEN = join(ROOT, "fixtures", "golden");
const BIN = join(ROOT, "src", "bin", "recon-run.ts");

const goldenReportBytes = readFileSync(join(GOLDEN, "report.json"));
const goldenHash = readFileSync(join(GOLDEN, "reportHash.txt"), "utf8").trim();

function loadFixtures(): { manifest: Manifest; ledger: Ledger } {
  const manifest = validateManifest(
    JSON.parse(readFileSync(join(GOLDEN, "manifest.json"), "utf8")),
  );
  const ledger = validateLedger(JSON.parse(readFileSync(join(GOLDEN, "ledger.json"), "utf8")));
  assert.ok(manifest.ok && ledger.ok, "golden fixtures must validate");
  if (!manifest.ok || !ledger.ok) throw new Error("unreachable");
  return { manifest: manifest.value, ledger: ledger.value };
}

function reconReport(): Report {
  const { manifest, ledger } = loadFixtures();
  const result = recon(manifest, ledger);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  return result.value.report;
}

test("AC-1.6.a — N in-process runs are byte-identical and match the committed golden", () => {
  const N = 5;
  for (let i = 0; i < N; i++) {
    const report = reconReport();
    const bytes = canonicalBytes(canonicalReport(report));
    const hash = canonicalHash(canonicalReport(report));
    assert.equal(hash, goldenHash, `run ${i}: reportHash drifted from golden`);
    assert.ok(
      Buffer.from(bytes).equals(goldenReportBytes),
      `run ${i}: report bytes drifted from golden`,
    );
  }
});

test("AC-1.6.a — a FRESH PROCESS reproduces the byte-identical report and hash", () => {
  const dir = mkdtempSync(join(tmpdir(), "tieout-recon-"));
  try {
    const spawnRun = (out: string): string => {
      const result = spawnSync(
        process.execPath,
        [
          "--disable-warning=ExperimentalWarning",
          BIN,
          join(GOLDEN, "manifest.json"),
          join(GOLDEN, "ledger.json"),
          out,
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, `recon-run exited non-zero:\n${result.stderr}`);
      return result.stdout.trim();
    };

    const out1 = join(dir, "report1.json");
    const out2 = join(dir, "report2.json");
    const hash1 = spawnRun(out1);
    const hash2 = spawnRun(out2);

    assert.equal(hash1, goldenHash);
    assert.equal(hash2, goldenHash);
    assert.ok(readFileSync(out1).equals(goldenReportBytes), "process 1 report bytes drifted");
    assert.ok(readFileSync(out2).equals(goldenReportBytes), "process 2 report bytes drifted");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-1.6.b — reordering an array (which JCS does NOT re-sort) changes the hash", () => {
  const canonical = canonicalReport(reconReport()) as Record<string, unknown> & { lots: unknown[] };
  const perturbed = { ...canonical, lots: [...canonical.lots].reverse() };
  // The unperturbed hash is the golden; the perturbation must diverge from it,
  // proving the array's declared order is load-bearing (AD-4/AD-13).
  assert.equal(canonicalHash(canonical as never), goldenHash);
  assert.notEqual(canonicalHash(perturbed as never), goldenHash);
});

test("AC-1.6.b — float/number coercion on the canonical path fails loudly", () => {
  const canonical = canonicalReport(reconReport()) as Record<string, unknown> & {
    pins: Record<string, unknown>;
  };
  // A coercion bug turns a bigint into a JS number — the canonicalizer refuses.
  const perturbed = {
    ...canonical,
    pins: { ...canonical.pins, startBlock: Number(canonical.pins["startBlock"]) },
  };
  assert.throws(() => canonicalHash(perturbed as never), /unsupported value of type "number"/);
});

test("AC-1.6.b — a JSON-number integer in a fixture double is rejected loudly", () => {
  const badManifest = JSON.parse(readFileSync(join(GOLDEN, "manifest.json"), "utf8")) as Record<
    string,
    unknown
  >;
  badManifest["startBlock"] = 21_000_000; // JSON number, not a decimal string
  const result = validateManifest(badManifest);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "json-number-integer");
});

test("AC-1.6.b — a fresh process EXITS NON-ZERO on a perturbed manifest (CI would go red)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tieout-recon-neg-"));
  try {
    const badManifest = JSON.parse(readFileSync(join(GOLDEN, "manifest.json"), "utf8")) as Record<
      string,
      unknown
    >;
    (badManifest["events"] as Array<Record<string, unknown>>)[0]!["value"] = 100; // JSON number
    const badPath = join(dir, "manifest.bad.json");
    writeFileSync(badPath, JSON.stringify(badManifest));
    const result = spawnSync(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", BIN, badPath, join(GOLDEN, "ledger.json")],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
