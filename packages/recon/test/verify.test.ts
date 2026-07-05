import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Health-audit Testing finding (TEST-1): the flagship trustless `verify` CLI —
// the tool an external auditor runs on a report they did not produce — had ZERO
// coverage of its error paths and exit-code contract, which is precisely why the
// REL-1 stack-trace regression could exist. These spawn tests pin the
// auditor-facing contract: usage → exit 2; every malformed/foreign input → exit
// 1 with a single clean `verify: …` line and NEVER a raw Node stack trace.
//
// All branches exercised here fail STRUCTURALLY, before reconstructManifest's
// first network call, so the suite needs no RPC. ETH_RPC_URL points at a dummy
// that is never contacted — if a regression let one of these reach the network,
// the test would hang, which is itself a signal.

const ROOT = join(import.meta.dirname, "..");
const GOLDEN = join(ROOT, "fixtures", "golden");
const BIN = join(ROOT, "src", "bin", "verify.ts");
const LEDGER = join(GOLDEN, "ledger.json");
const goldenReport = JSON.parse(readFileSync(join(GOLDEN, "report.json"), "utf8")) as Record<
  string,
  unknown
>;
const DUMMY_RPC = "http://127.0.0.1:1";

type RunOpts = { rpc?: string | null; args?: string[] };

/** Run `verify` in a fresh process against an ephemeral report.json. */
function runVerify(reportJson: string, opts: RunOpts = {}): SpawnSyncReturns<string> {
  const dir = mkdtempSync(join(tmpdir(), "tieout-verify-"));
  try {
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, reportJson);
    const argv = opts.args ?? [reportPath, LEDGER];
    const env: NodeJS.ProcessEnv = { ...process.env, VERIFY_CHUNK: "9" };
    if (opts.rpc === null) delete env["ETH_RPC_URL"];
    else env["ETH_RPC_URL"] = opts.rpc ?? DUMMY_RPC;
    return spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", BIN, ...argv], {
      encoding: "utf8",
      env,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A copy of the golden report with `pins` fields overridden. */
function reportWithPins(over: Record<string, string>): string {
  const report = { ...goldenReport, pins: { ...(goldenReport["pins"] as object), ...over } };
  return JSON.stringify(report);
}

/** Assert a clean single-line typed failure — the L3 guarantee — not a crash. */
function assertCleanFailure(result: SpawnSyncReturns<string>): void {
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}\nstderr:\n${result.stderr}`);
  assert.ok(
    result.stderr.trim().startsWith("verify:"),
    `expected a "verify: …" line, got:\n${result.stderr}`,
  );
  assert.ok(!/\n\s+at /.test(result.stderr), `stderr carried a stack trace:\n${result.stderr}`);
  assert.ok(!/Error:/.test(result.stderr), `stderr carried a raw Error:\n${result.stderr}`);
}

test("verify exits 2 on a usage error (missing arguments)", () => {
  const result = runVerify("{}", { args: [] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage:/);
});

test("verify exits 1 with a typed line when ETH_RPC_URL is unset", () => {
  const result = runVerify(JSON.stringify(goldenReport), { rpc: null });
  assertCleanFailure(result);
  assert.match(result.stderr, /ETH_RPC_URL not set/);
});

test("verify exits 1 cleanly on a structurally malformed report.json", () => {
  const result = runVerify("{}");
  assertCleanFailure(result);
  assert.match(result.stderr, /malformed report\.json/);
});

test("REL-1: a non-numeric pin fails cleanly, never crashing with a stack trace", () => {
  // pins.startBlock = "abc" reaches a bare BigInt("abc") three lines below a
  // comment promising the verifier "never crash … with a stack trace".
  const result = runVerify(reportWithPins({ startBlock: "abc" }));
  assertCleanFailure(result);
  assert.match(result.stderr, /startBlock/);
});

test("REL-1: a negative pin fails cleanly instead of sailing into the RPC fetch", () => {
  // BigInt("-5") SUCCEEDS, so a negative-block report slipped past the guard.
  const result = runVerify(reportWithPins({ startBlock: "-5" }));
  assertCleanFailure(result);
  assert.match(result.stderr, /startBlock/);
});

test("verify exits 1 with a version-skew line on an engineVersion mismatch", () => {
  const result = runVerify(JSON.stringify({ ...goldenReport, engineVersion: "9.9.9" }));
  assertCleanFailure(result);
  assert.match(result.stderr, /version skew/);
});
