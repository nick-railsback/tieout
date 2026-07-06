import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseReportJson, type Report } from "@tieout/recon";
import {
  anchorViewModel,
  ANCHOR_NOTE,
  HONESTY_BOUNDARY,
  REPORT_NOTE,
  livePositionViewModel,
  reportViewModel,
} from "../src/view.ts";

// Story 5.2 — the shell's pure view models. Chain reads (Multicall3 / WebSocket)
// are shell effects asserted structurally; here we prove the DOM-free rendering
// logic against the real committed report assets the surface actually serves.

const PUBLIC = join(import.meta.dirname, "..", "public");
const loadReport = (name: string): unknown => JSON.parse(readFileSync(join(PUBLIC, name), "utf8"));

test("AC-5.2.b — the honesty boundary is present and does not overclaim", () => {
  assert.match(HONESTY_BOUNDARY, /derivation was reproduced/i);
  assert.match(HONESTY_BOUNDARY, /not that the books are right/i);
  // AD-14: the anchor proves a timestamp, not correctness or author identity.
  assert.match(ANCHOR_NOTE, /timestamp/i);
  assert.match(ANCHOR_NOTE, /not an author signature/i);
  // Review fix #3: the demo note is honest that both committed reports carry the
  // injected discrepancy and points at the real always-green signal.
  assert.match(REPORT_NOTE, /injected reward discrepancy/i);
  assert.match(REPORT_NOTE, /closing-shares axis tie-out/i);
});

test("AC-5.2.a — the slice report view names the breaking event and narrates the cause", () => {
  const view = reportViewModel(parseReportJson(loadReport("report.slice.json")));
  assert.equal(view.status, "discrepancy");

  const line = view.discrepancies[0]!.line;
  assert.match(line, /0x5632e96c6acca45e7f081fb09e3d8fb1ee25ef8da58129503fbd1446cec04c98/);
  assert.match(line, /block 25444795/);
  assert.match(line, /logIndex 29/);
  assert.match(line, /\+0\.000000001 stETH/);

  // The everyday always-green axis (closing shares) ties out; reward breaks.
  assert.equal(view.axes.find((a) => a.axis === "closingShares")?.tieOut, true);
  assert.equal(view.axes.find((a) => a.axis === "reward")?.tieOut, false);

  // a11y: each axis carries a screen-reader label for its ✓/✗ glyph so it is
  // not read as "check"/"multiplication x".
  assert.equal(view.axes.find((a) => a.axis === "closingShares")?.tieOutLabel, "ties out");
  assert.equal(view.axes.find((a) => a.axis === "reward")?.tieOutLabel, "does not tie out");
});

test("AC-5.2.b — a reconciled report renders the always-green state", () => {
  const report = parseReportJson(loadReport("report.golden.json"));
  const reconciled: Report = { ...report, discrepancies: [] };
  const view = reportViewModel(reconciled);
  assert.equal(view.status, "reconciled");
  assert.match(view.headline, /reconciled/i);
});

test("live position view computes the stETH value from the chain reads (display-only)", () => {
  // 2 wstETH @ 1.19 stETH/wstETH → 2.38 stETH.
  const view = livePositionViewModel({
    subject: "0xda7a000000000000000000000000000000000000",
    balanceWstEth: 2_000000000000000000n,
    stEthPerToken: 1_190000000000000000n,
  });
  assert.equal(view.balanceWstEth, "2");
  assert.equal(view.stEthPerToken, "1.19");
  assert.equal(view.balanceStEth, "2.38");
});

test("AC-5.2.a — the anchor degrades gracefully: undeployed → 'not yet anchored', no fake record", () => {
  // chainId 1 has token/feed/utility entries but no registry → a genuine
  // not-deployed state (8453/84532/31337 are all anchored as of Batch 6).
  const notDeployed = anchorViewModel({ kind: "not-deployed", chainId: 1 });
  assert.match(notDeployed.label, /not yet anchored/i);
  assert.equal(notDeployed.tone, "neutral");
  assert.match(notDeployed.detail, /none is invented/i);

  const anchored = anchorViewModel({
    kind: "anchored",
    chainId: 31337,
    reportHash: "0xabc",
    blockNumber: 10n,
    timestamp: 1_700_000_000n,
  });
  assert.match(anchored.detail, /block 10/);
  assert.match(anchored.detail, /unix 1700000000/);
  assert.equal(anchored.tone, "ok");
});
