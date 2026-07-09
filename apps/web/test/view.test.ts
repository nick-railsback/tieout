import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { formatUnits } from "viem";
import { parseReportJson, type Report } from "@tieout/recon";
import {
  anchorViewModel,
  ANCHOR_CONTRAST,
  ANCHOR_NOTE,
  HONESTY_BOUNDARY,
  REPORT_EXPLAINERS,
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
});

test("CAP-2 — the per-report explainers tell a stranger what each demo is", () => {
  // Golden is a made-up fixture and says so: synthetic, the 150 wstETH exists
  // nowhere on mainnet, and its reward break is deliberate.
  assert.match(REPORT_EXPLAINERS.golden, /synthetic/i);
  assert.match(REPORT_EXPLAINERS.golden, /150 wstETH/);
  assert.match(REPORT_EXPLAINERS.golden, /deliberate/i);
  assert.match(REPORT_EXPLAINERS.golden, /reward/i);
  // Slice is a real mainnet wallet over a pinned finalized window, with a
  // deliberately injected discrepancy.
  assert.match(REPORT_EXPLAINERS.slice, /real .*mainnet/i);
  assert.match(REPORT_EXPLAINERS.slice, /deliberate/i);
  assert.match(REPORT_EXPLAINERS.slice, /reward/i);
  // The copy's whole job is telling the two apart — assert the distinction, not
  // just each report's own claim (a lax regex tweak must not pass on both).
  assert.doesNotMatch(REPORT_EXPLAINERS.golden, /real mainnet/i);
  assert.doesNotMatch(REPORT_EXPLAINERS.slice, /synthetic/i);
  // Review fix #3's honesty framing survives in both: the everyday always-green
  // signal is the live position + the closing-balance check, never a hand-built
  // "all clear".
  for (const explainer of [REPORT_EXPLAINERS.golden, REPORT_EXPLAINERS.slice]) {
    assert.match(explainer, /always-green signal/i);
    assert.match(explainer, /never a hand-built/i);
  }
});

test("CAP-6 — the anchor contrast lines explain the golden/slice split without overclaiming", () => {
  // Golden: the un-attested state is deliberate, and the panel reads real chain
  // state — never framed as a failure.
  assert.match(ANCHOR_CONTRAST.golden, /deliberate/i);
  assert.match(ANCHOR_CONTRAST.golden, /real .*chain state/i);
  assert.doesNotMatch(ANCHOR_CONTRAST.golden, /fail|broken|error/i);
  // Slice: attested at release; the record is read live, not baked in.
  assert.match(ANCHOR_CONTRAST.slice, /attested on Base/i);
  assert.match(ANCHOR_CONTRAST.slice, /read live/i);
  // Discrimination, both directions: only golden owns the never-attested
  // framing, only slice claims an attestation.
  assert.match(ANCHOR_CONTRAST.golden, /never attested/i);
  assert.doesNotMatch(ANCHOR_CONTRAST.slice, /never attested/i);
  assert.doesNotMatch(ANCHOR_CONTRAST.golden, /attested on Base/i);
  assert.doesNotMatch(ANCHOR_CONTRAST.slice, /synthetic/i);
  assert.notEqual(ANCHOR_CONTRAST.golden, ANCHOR_CONTRAST.slice);
  // The lines describe design intent only — painted unconditionally, they must
  // never quote a concrete badge state the panel might not be showing (the
  // anchor read can error; the reset path blanks the badge to "—").
  for (const line of [ANCHOR_CONTRAST.golden, ANCHOR_CONTRAST.slice]) {
    assert.doesNotMatch(line, /not yet anchored|anchor read failed|above|beside/i);
    // AD-14: neither line lets the anchor prove correctness or identity — that
    // boundary stays with ANCHOR_NOTE (pinned in AC-5.2.b above).
    assert.doesNotMatch(line, /correct|identity|books|author/i);
  }
});

test("CAP-2 — the golden explainer's figures are tethered to the shipped fixture", () => {
  // The prose hardcodes fixture facts; bind them to report.golden.json so a
  // regenerated fixture can't leave the copy silently lying (review finding).
  const golden = loadReport("report.golden.json") as {
    subject: string;
    axes: {
      closingShares: { onchain: string };
      reward: { onchain: string; ledger: string };
    };
  };
  const shares = formatUnits(BigInt(golden.axes.closingShares.onchain), 18);
  const rewardBreak = formatUnits(
    BigInt(golden.axes.reward.onchain) - BigInt(golden.axes.reward.ledger),
    18,
  );
  assert.ok(REPORT_EXPLAINERS.golden.includes(`${shares} wstETH`), "closing position drifted");
  assert.ok(REPORT_EXPLAINERS.golden.includes(`${rewardBreak} stETH`), "reward break drifted");
  assert.ok(
    REPORT_EXPLAINERS.golden.includes(golden.subject.slice(0, 6)),
    "vanity subject drifted",
  );
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
