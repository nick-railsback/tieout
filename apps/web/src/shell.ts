/**
 * The imperative web shell (AD-1). It fetches the committed report + hash assets,
 * paints the pure view models from `view.ts` onto the DOM, and wires the two
 * chain effects — live positions (mainnet, Multicall3 + WebSocket) and the Base
 * anchor read. It renders NO value that did not come from real engine or chain
 * output (AD-16/AD-17), and it never re-hashes the report (AD-13).
 *
 * Extracted from `main.ts` into a `createShell(deps)` factory so its DOM
 * painting, generation-race guards, and — crucially — its error paths are
 * testable headless, mirroring the injectable-`deps` seam `live.ts` already uses.
 * `main.ts` supplies the real DOM/`fetch`/chain effects and calls `mount()`.
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

/**
 * The minimal structural DOM surface the shell touches. Typing it explicitly
 * (rather than depending on the global `Document`) lets a test drive the shell
 * with a lightweight in-memory double — no jsdom/happy-dom dependency, in the
 * same spirit as `live.ts`'s injected client seam.
 */
export interface ShellElement {
  textContent: string | null;
  className: string;
  setAttribute(name: string, value: string): void;
  append(...nodes: ShellElement[]): void;
  replaceChildren(...nodes: ShellElement[]): void;
  readonly dataset: Record<string, string | undefined>;
  addEventListener(type: string, handler: () => void): void;
}
export interface ShellDom {
  getElementById(id: string): ShellElement | null;
  createElement(tag: string): ShellElement;
  querySelector(selector: string): ShellElement | null;
  querySelectorAll(selector: string): Iterable<ShellElement>;
}

export type ShellDeps = {
  readonly dom: ShellDom;
  readonly fetchFn: (url: string) => Promise<Response>;
  readonly startLive: typeof startLivePositions;
  readonly readAnchorFn: typeof readAnchor;
};

function defaultDeps(): ShellDeps {
  return {
    dom: document as unknown as ShellDom,
    fetchFn: (url) => fetch(url),
    startLive: startLivePositions,
    readAnchorFn: readAnchor,
  };
}

export type Shell = {
  loadReport(key: ReportKey): Promise<void>;
  mount(): void;
};

export function createShell(deps: ShellDeps = defaultDeps()): Shell {
  const { dom, fetchFn, startLive, readAnchorFn } = deps;

  function el(id: string): ShellElement {
    const node = dom.getElementById(id);
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

  // Monotonic generation: a rapid report toggle bumps this so a stale in-flight
  // load, live read, or anchor read cannot paint the wrong report/subject (AD-16).
  let generation = 0;
  let liveHandle: LivePositionsHandle | undefined;

  /** `fetch` that rejects on a non-2xx response — native `fetch` does not, which
   * would otherwise turn a 404 body into a garbage report/hash. */
  async function fetchOk(url: string): Promise<Response> {
    const response = await fetchFn(url);
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
      const li = dom.createElement("li");
      li.textContent = "No book-vs-chain discrepancy — the derivation reproduced.";
      narration.replaceChildren(li);
    } else {
      narration.replaceChildren(
        ...view.discrepancies.map((discrepancy) => {
          const li = dom.createElement("li");
          li.textContent = discrepancy.line;
          return li;
        }),
      );
    }

    const axes = el("report-axes");
    axes.replaceChildren(
      ...view.axes.map((axis) => {
        const tr = dom.createElement("tr");
        const cells = [
          `${axis.label}`,
          `${axis.onchain} ${axis.unit}`,
          `${axis.ledger} ${axis.unit}`,
          `${axis.delta} ${axis.unit}`,
        ];
        for (const [i, text] of cells.entries()) {
          const td = dom.createElement("td");
          if (i > 0) td.className = "mono";
          td.textContent = text;
          tr.append(td);
        }
        const tie = dom.createElement("td");
        // Name-from-author on a bare <td> (role=cell) is unreliably announced —
        // NVDA/VoiceOver commonly read the cell contents ("check"/"multiplication
        // x") and ignore an aria-label. Put the glyph in an inner role=img span so
        // the label reliably names it (UX-3).
        const glyph = dom.createElement("span");
        glyph.textContent = axis.tieOut ? "✓" : "✗";
        glyph.className = axis.tieOut ? "tie-ok" : "tie-no";
        glyph.setAttribute("role", "img");
        glyph.setAttribute("aria-label", axis.tieOutLabel);
        tie.append(glyph);
        tr.append(tie);
        return tr;
      }),
    );

    return report.subject as `0x${string}`;
  }

  /** Clear every report + anchor field to a neutral placeholder. On a failed
   * load the shell must NOT leave the previous report's axes, USD figures, and —
   * worst of all — hash painted under a "load failed" badge; a stale hash under
   * an error badge is the worst state for a hash-bound-display tool (UX-1). */
  function resetReportPanel(): void {
    setText("report-window", "—");
    setText("report-current", "—");
    setText("report-cost", "—");
    setText("report-pnl", "—");
    setText("report-hash", "—");
    setText("live-subject", "—");
    el("report-narration").replaceChildren();
    el("report-axes").replaceChildren();
    setBadge("anchor-status", "—", "neutral");
    setText("anchor-detail", "—");
  }

  /** Read + paint the Base anchor for a report hash (graceful when undeployed).
   * Guarded by `myGeneration` so a superseded load's async result can't paint. */
  async function paintAnchor(myGeneration: number, reportHash: Hex): Promise<void> {
    setText("anchor-chain", String(ANCHOR_CHAIN_ID));
    setBadge("anchor-status", "reading…", "neutral");
    const state = await readAnchorFn({ chainId: ANCHOR_CHAIN_ID, reportHash, rpcUrl: ANCHOR_RPC_URL });
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
    // The previous stream is stopped, so the live badge must not keep claiming
    // "live" (nor sit forever at the initial "connecting…") while nothing
    // streams. A successful load repaints it via startLive; a failed one leaves
    // this neutral placeholder rather than a lie — AC-5.2.c ("never dies
    // silently") applies on the report-fetch-failure path too (UX-2).
    setBadge("live-status", "—", "neutral");

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
      // Reset the panel FIRST so no stale axes/USD/hash survive under the badge (UX-1).
      resetReportPanel();
      setBadge("report-status", "load failed", "warn");
      setText(
        "report-headline",
        `Could not load ${report.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    liveHandle = startLive({
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

  /** The report shown on first load. The slice report's subject is a REAL mainnet
   * wallet, so the marquee live panel reads real (non-zero) balances; the golden
   * report's subject is a synthetic vanity address whose live position is all
   * zeros — technically honest but indistinguishable from broken as a first
   * impression (UX-4). Must stay in sync with index.html's initial aria-pressed. */
  const DEFAULT_REPORT: ReportKey = "slice";

  /** Paint the static honesty copy, label + wire the report toggles, and load the
   * default report. Kept out of module scope so importing the shell has no side
   * effects (the test drives `loadReport` directly). */
  function mount(): void {
    setText("honesty-banner", HONESTY_BOUNDARY);
    setText("anchor-note", ANCHOR_NOTE);
    setText("report-note", REPORT_NOTE);

    for (const [key, report] of Object.entries(REPORTS)) {
      const button = dom.querySelector(`button[data-report="${key}"]`);
      if (button) button.textContent = report.label;
    }

    for (const button of dom.querySelectorAll("button[data-report]")) {
      button.addEventListener("click", () => {
        const key = button.dataset["report"] as ReportKey;
        for (const other of dom.querySelectorAll("button[data-report]")) {
          other.setAttribute("aria-pressed", String(other === button));
        }
        void loadReport(key).catch((error) => console.error("loadReport failed", error));
      });
    }

    void loadReport(DEFAULT_REPORT).catch((error) => console.error("loadReport failed", error));
  }

  return { loadReport, mount };
}
