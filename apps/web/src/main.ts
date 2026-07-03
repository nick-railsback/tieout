/**
 * The imperative shell (AD-1). It fetches the committed report + hash assets,
 * paints the pure view models from `view.ts` onto the DOM, and wires the two
 * chain effects — live positions (mainnet, Multicall3 + WebSocket) and the Base
 * anchor read. It renders NO value that did not come from real engine or chain
 * output (AD-16/AD-17), and it never re-hashes the report (AD-13): the report
 * hash is loaded as committed data.
 */
import type { Hex } from "viem";
import { parseReportJson } from "@tieout/recon";
import { ANCHOR_CHAIN_ID, ANCHOR_RPC_URL, REPORTS, type ReportKey } from "./config.ts";
import { readAnchor } from "./anchor.ts";
import { startLivePositions, type LivePositionsHandle, type LiveStatus } from "./live.ts";
import {
  anchorViewModel,
  HONESTY_BOUNDARY,
  ANCHOR_NOTE,
  REPORT_NOTE,
  livePositionViewModel,
  reportViewModel,
} from "./view.ts";

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing #${id}`);
  return node;
}
const setText = (id: string, text: string): void => {
  el(id).textContent = text;
};
function setBadge(id: string, text: string, tone: "ok" | "warn" | "neutral"): void {
  const node = el(id);
  node.textContent = text;
  node.className = `badge ${tone}`;
}

// Static honesty copy (AD-16, AD-14) + the report-demo note (AC-5.2.b honesty).
setText("honesty-banner", HONESTY_BOUNDARY);
setText("anchor-note", ANCHOR_NOTE);
setText("report-note", REPORT_NOTE);

// Report toggle labels.
for (const [key, report] of Object.entries(REPORTS)) {
  const button = document.querySelector<HTMLButtonElement>(`button[data-report="${key}"]`);
  if (button) button.textContent = report.label;
}

// Monotonic generation: a rapid report toggle bumps this so a stale in-flight
// load, live read, or anchor read cannot paint the wrong report/subject (AD-16).
let generation = 0;
let liveHandle: LivePositionsHandle | undefined;

/** `fetch` that rejects on a non-2xx response — native `fetch` does not, which
 * would otherwise turn a 404 body into a garbage report/hash. */
async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response;
}

/** Paint the live-position connection badge (a real "disconnected" terminal
 * state, not a perpetual "reconnecting…", AC-5.2.c). */
function paintLive(status: LiveStatus): void {
  const tone = status === "live" ? "ok" : status === "disconnected" ? "warn" : "neutral";
  const label = status === "live" || status === "disconnected" ? status : `${status}…`;
  setBadge("live-status", label, tone);
}

/** Render the reconciliation panel from a hydrated report; returns the subject. */
function paintReport(reportJson: unknown, reportHash: string): `0x${string}` {
  const report = parseReportJson(reportJson);
  const view = reportViewModel(report);

  setBadge(
    "report-status",
    view.status === "reconciled" ? "reconciled" : "discrepancy",
    view.status === "reconciled" ? "ok" : "warn",
  );
  setText("report-headline", view.headline);
  setText("report-window", view.window);
  setText("report-current", view.usd.currentValue);
  setText("report-cost", view.usd.costBasis);
  setText("report-pnl", view.usd.unrealizedPnl);
  setText("report-hash", reportHash);
  setText("live-subject", view.subject);

  const narration = el("report-narration");
  if (view.discrepancies.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No book-vs-chain discrepancy — the derivation reproduced.";
    narration.replaceChildren(li);
  } else {
    narration.replaceChildren(
      ...view.discrepancies.map((discrepancy) => {
        const li = document.createElement("li");
        li.textContent = discrepancy.line;
        return li;
      }),
    );
  }

  const axes = el("report-axes");
  axes.replaceChildren(
    ...view.axes.map((axis) => {
      const tr = document.createElement("tr");
      const cells = [
        `${axis.label}`,
        `${axis.onchain} ${axis.unit}`,
        `${axis.ledger} ${axis.unit}`,
        `${axis.delta} ${axis.unit}`,
      ];
      for (const [i, text] of cells.entries()) {
        const td = document.createElement("td");
        if (i > 0) td.className = "mono";
        td.textContent = text;
        tr.append(td);
      }
      const tie = document.createElement("td");
      tie.textContent = axis.tieOut ? "✓" : "✗";
      tie.className = axis.tieOut ? "tie-ok" : "tie-no";
      tr.append(tie);
      return tr;
    }),
  );

  return report.subject as `0x${string}`;
}

/** Read + paint the Base anchor for a report hash (graceful when undeployed).
 * Guarded by `myGeneration` so a superseded load's async result can't paint. */
async function paintAnchor(myGeneration: number, reportHash: Hex): Promise<void> {
  setText("anchor-chain", String(ANCHOR_CHAIN_ID));
  setBadge("anchor-status", "reading…", "neutral");
  const state = await readAnchor({ chainId: ANCHOR_CHAIN_ID, reportHash, rpcUrl: ANCHOR_RPC_URL });
  if (myGeneration !== generation) return;
  const view = anchorViewModel(state);
  setBadge("anchor-status", view.label, view.tone);
  setText("anchor-detail", view.detail);
}

/** Load a report end-to-end: render the diff, (re)start the live stream for its
 * subject, and read its anchor. Every fetch/parse failure is surfaced in the UI
 * ("the shell owns that error state"); a newer toggle supersedes an in-flight load. */
async function loadReport(key: ReportKey): Promise<void> {
  const myGeneration = ++generation;
  const report = REPORTS[key];

  liveHandle?.stop();
  liveHandle = undefined;
  setText("live-wsteth", "—");
  setText("live-rate", "—");
  setText("live-steth", "—");

  let reportHash: Hex;
  let subject: `0x${string}`;
  try {
    const [reportJson, reportHashRaw] = await Promise.all([
      fetchOk(report.json).then((r) => r.json()),
      fetchOk(report.hash).then((r) => r.text()),
    ]);
    if (myGeneration !== generation) return; // a newer toggle superseded this load
    reportHash = reportHashRaw.trim() as Hex;
    subject = paintReport(reportJson, reportHash);
  } catch (error) {
    if (myGeneration !== generation) return;
    setBadge("report-status", "load failed", "warn");
    setText(
      "report-headline",
      `Could not load ${report.label}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  liveHandle = startLivePositions({
    subject,
    onUpdate: (position) => {
      if (myGeneration !== generation) return; // stale read from a superseded load
      const live = livePositionViewModel(position);
      setText("live-subject", live.subject);
      setText("live-wsteth", `${live.balanceWstEth} wstETH`);
      setText("live-rate", live.stEthPerToken);
      setText("live-steth", `${live.balanceStEth} stETH`);
    },
    onStatus: (status) => {
      if (myGeneration !== generation) return;
      paintLive(status);
    },
    onError: (error) => {
      // Surfaced via onStatus ("reconnecting"/"disconnected"); log for diagnosis.
      console.error("live positions error", error);
    },
  });

  await paintAnchor(myGeneration, reportHash);
}

// Wire the toggle and load the golden report by default.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-report]")) {
  button.addEventListener("click", () => {
    const key = button.dataset["report"] as ReportKey;
    for (const other of document.querySelectorAll<HTMLButtonElement>("button[data-report]")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
    void loadReport(key).catch((error) => console.error("loadReport failed", error));
  });
}

void loadReport("golden").catch((error) => console.error("loadReport failed", error));
