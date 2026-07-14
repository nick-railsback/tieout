import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createShell, type ShellDeps, type ShellDom, type ShellElement } from "../src/shell.ts";
import {
  ANCHOR_CONTRAST,
  HONESTY_BOUNDARY,
  REPORT_EXPLAINERS,
  type AnchorState,
} from "../src/view.ts";
import { REPORTS } from "../src/config.ts";

// Health-audit Testing finding (TEST-2): main.ts — the whole web shell, where
// the async races and error rendering live — had zero tests, which is exactly
// why UX-1 (a stale report's hash left under a "load failed" badge) and UX-2 (a
// live badge that keeps claiming "live"/"connecting…" over nothing) shipped.
// The shell now factors into createShell(deps); these drive it with a tiny
// in-memory DOM double (no jsdom/happy-dom) and pin both error paths.

const PUBLIC = join(import.meta.dirname, "..", "public");
const goldenObj = JSON.parse(readFileSync(join(PUBLIC, "report.golden.json"), "utf8")) as unknown;
const goldenHash = readFileSync(join(PUBLIC, "report.golden.hash.txt"), "utf8").trim();

/** A minimal DOM element — just the surface `shell.ts` mutates. */
class FakeEl implements ShellElement {
  textContent: string | null = "";
  className = "";
  children: FakeEl[] = [];
  readonly dataset: Record<string, string | undefined> = {};
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  append(...nodes: ShellElement[]): void {
    this.children.push(...(nodes as FakeEl[]));
  }
  replaceChildren(...nodes: ShellElement[]): void {
    this.children = nodes as FakeEl[];
  }
  addEventListener(type: string, handler: () => void): void {
    this.listeners.set(type, handler);
  }
}

class FakeDom implements ShellDom {
  private readonly byId = new Map<string, FakeEl>();
  private readonly buttons: FakeEl[] = ["golden", "slice"].map((key) => {
    const b = new FakeEl();
    b.dataset["report"] = key;
    return b;
  });
  getElementById(id: string): FakeEl {
    let node = this.byId.get(id);
    if (node === undefined) {
      node = new FakeEl();
      this.byId.set(id, node);
    }
    return node;
  }
  createElement(): FakeEl {
    return new FakeEl();
  }
  querySelector(selector: string): FakeEl | null {
    const match = selector.match(/data-report="(\w+)"/);
    return match ? (this.buttons.find((b) => b.dataset["report"] === match[1]) ?? null) : null;
  }
  querySelectorAll(): Iterable<FakeEl> {
    return this.buttons;
  }
  text(id: string): string | null | undefined {
    return this.byId.get(id)?.textContent;
  }
  cls(id: string): string | undefined {
    return this.byId.get(id)?.className;
  }
  childCount(id: string): number {
    return this.byId.get(id)?.children.length ?? 0;
  }
}

// chainId 1 has no registry entry → a genuine "not-deployed" anchor state to
// exercise the shell's degraded rendering (the Base rungs are anchored, Batch 6).
const notDeployed: AnchorState = { kind: "not-deployed", chainId: 1 };

/** deps whose fetch succeeds for golden and fails for slice (the failing toggle). */
function makeDeps(dom: FakeDom, opts: { failGolden?: boolean } = {}): ShellDeps {
  return {
    dom,
    fetchFn: async (url: string): Promise<Response> => {
      const isGolden = url.includes("golden");
      if (isGolden && opts.failGolden) throw new Error(`network fail for ${url}`);
      if (!isGolden) throw new Error(`network fail for ${url}`); // slice always fails
      const body = url.endsWith(".json")
        ? { ok: true, status: 200, statusText: "OK", json: async () => goldenObj }
        : { ok: true, status: 200, statusText: "OK", text: async () => goldenHash };
      return body as unknown as Response;
    },
    // Fire "live" so a healthy load paints the live badge; the failure paths must
    // then move it OFF "live", never leave it lying.
    startLive: ((config: { onStatus: (s: "live") => void }) => {
      config.onStatus("live");
      return { stop: () => {} };
    }) as unknown as ShellDeps["startLive"],
    readAnchorFn: async () => notDeployed,
  };
}

test("UX-1/UX-2: a failed toggle clears the previous report's hash and live badge", async () => {
  const dom = new FakeDom();
  const shell = createShell(makeDeps(dom));

  // A healthy golden load paints the real hash and a live badge.
  await shell.loadReport("golden");
  assert.equal(dom.text("report-hash"), goldenHash, "golden load should paint its hash");
  assert.equal(dom.text("live-status"), "live", "golden load should mark the panel live");

  // Toggling to a report whose fetch fails must NOT leave golden's data painted.
  await shell.loadReport("slice");

  assert.equal(dom.text("report-status"), "load failed");
  // UX-1: no stale hash / axes / USD under the "load failed" badge.
  assert.equal(
    dom.text("report-hash"),
    "—",
    "stale report hash left under load-failed badge (UX-1)",
  );
  assert.equal(dom.text("report-current"), "—");
  assert.equal(dom.text("report-cost"), "—");
  assert.equal(dom.text("report-pnl"), "—");
  assert.equal(dom.childCount("report-axes"), 0, "stale axis rows survived the failure (UX-1)");
  assert.equal(dom.childCount("report-narration"), 0);
  assert.equal(dom.text("anchor-status"), "—", "stale anchor verdict survived the failure (UX-1)");

  // UX-2: the live badge no longer claims "live" over em-dash values.
  assert.equal(dom.text("live-status"), "—", "live badge kept a stale status after failure (UX-2)");
  assert.equal(dom.cls("live-status"), "badge neutral");
  assert.equal(dom.text("live-wsteth"), "—");
});

test("UX-3: the tie-out glyph is a role=img span with a text label, not a bare cell", async () => {
  const dom = new FakeDom();
  const shell = createShell(makeDeps(dom));
  await shell.loadReport("golden");

  const axes = dom.getElementById("report-axes");
  assert.ok(axes.children.length >= 1, "axis rows must be painted");
  const row = axes.children[0]!;
  const tieCell = row.children[row.children.length - 1]!; // the tie-out cell
  // Name-from-author on a bare <td> (role=cell) is unreliably announced; the
  // label must sit on an inner role=img span (UX-3).
  const glyph = tieCell.children[0];
  assert.ok(glyph, "the tie cell must wrap the glyph in an inner element");
  assert.equal(glyph!.attrs.get("role"), "img");
  assert.match(glyph!.attrs.get("aria-label") ?? "", /ties out|does not tie out/);
});

// Code review 2026-07-07, finding #2: the report + hash assets were fetched via
// ROOT-ABSOLUTE paths ("/report.*.json"), which a path-style IPFS gateway
// (https://ipfs.io/ipfs/<CID>/) resolves against the gateway ROOT — dropping the
// CID directory and 404-ing every report. That is exactly the deployment
// vite.config.ts `base: "./"` targets (AC-6.9). The paths must be gateway-relative
// so native fetch resolves them against document.baseURI under the CID directory.
test("review #2: report assets fetch under a path-style IPFS gateway CID, not the gateway root", async () => {
  const GATEWAY = "https://ipfs.io/ipfs/bafyCID/"; // a path-style gateway directory URL
  const fetched: string[] = [];
  const dom = new FakeDom();
  const base = makeDeps(dom);
  const shell = createShell({
    ...base,
    fetchFn: (url: string): Promise<Response> => {
      fetched.push(url);
      return base.fetchFn(url);
    },
  });

  await shell.loadReport("golden");

  assert.ok(fetched.length >= 2, "both the report json and its hash should be fetched");
  for (const url of fetched) {
    // The browser resolves each fetch() argument against the document base URL.
    // Under a path-style gateway that base is the CID directory; a root-absolute
    // path escapes it to the gateway root (the bug this finding named).
    const resolved = new URL(url, GATEWAY).href;
    assert.ok(
      resolved.startsWith(GATEWAY),
      `report asset "${url}" escaped the gateway CID dir → ${resolved} (finding #2)`,
    );
  }
});

test("CAP-2: mount paints the labels, honesty copy, and the default explainer", () => {
  const dom = new FakeDom();
  const shell = createShell(makeDeps(dom));
  shell.mount();

  assert.equal(dom.text("honesty-banner"), HONESTY_BOUNDARY);
  // mount no longer paints a static note — the default load's synchronous entry
  // paint owns it, so the slice explainer must be up before any fetch settles.
  assert.equal(dom.text("report-note"), REPORT_EXPLAINERS.slice);
  // The anchor contrast line rides the same synchronous entry paint (CAP-6).
  assert.equal(dom.text("anchor-contrast"), ANCHOR_CONTRAST.slice);
  for (const [key, report] of Object.entries(REPORTS)) {
    const button = dom.querySelector(`button[data-report="${key}"]`);
    assert.equal(button?.textContent, report.label, `${key} toggle label`);
  }
});

test("CAP-2: the report note and anchor contrast repaint per toggle and the last click wins", async () => {
  const dom = new FakeDom();
  // Gate golden's fetch so its continuation provably runs AFTER a newer slice
  // click — a real supersession, not just synchronous call order.
  let releaseGolden!: () => void;
  const gate = new Promise<void>((resolve) => (releaseGolden = resolve));
  const deps = makeDeps(dom);
  const shell = createShell({
    ...deps,
    fetchFn: async (url: string): Promise<Response> => {
      if (url.includes("golden")) await gate;
      return deps.fetchFn(url);
    },
  });

  // Each load paints its own explainer synchronously at entry — the note tracks
  // the click, not the fetch (which for golden is still gated).
  const first = shell.loadReport("golden");
  assert.equal(dom.text("report-note"), REPORT_EXPLAINERS.golden);
  assert.equal(dom.text("anchor-contrast"), ANCHOR_CONTRAST.golden);

  // A second click supersedes golden mid-flight. Its fetch fails (slice always
  // fails in these deps), yet the note still shows the selected explainer.
  const second = shell.loadReport("slice");
  assert.equal(dom.text("report-note"), REPORT_EXPLAINERS.slice, "last click must win");
  assert.equal(dom.text("anchor-contrast"), ANCHOR_CONTRAST.slice, "contrast follows the click");
  await second;
  assert.equal(dom.text("report-status"), "load failed");
  assert.equal(dom.text("report-note"), REPORT_EXPLAINERS.slice);
  // On a failed load no registry read is ever attempted, so the contrast line's
  // live-read claim must not stand over the blanked panel — reset clears it
  // (review 2026-07-09 #1); the next successful load repaints it.
  assert.equal(dom.text("anchor-contrast"), "", "no live-read claim over a blanked panel");

  // Now let golden's fetch succeed late: the superseded continuation must not
  // repaint anything — not the note, not the hash, not the failed badge.
  releaseGolden();
  await first;
  assert.equal(dom.text("report-note"), REPORT_EXPLAINERS.slice, "late settle must not repaint");
  assert.equal(dom.text("anchor-contrast"), "", "late settle must not repaint the contrast line");
  assert.equal(dom.text("report-status"), "load failed", "superseded load must not win");
  assert.equal(dom.text("report-hash"), "—", "superseded load must not paint its hash");
});

test("CAP-6: an anchor read error leaves the contrast line untouched", async () => {
  // Spec I/O row 4: the contrast line describes design intent, not read
  // results — a failed registry read must not blank or rewrite it.
  const dom = new FakeDom();
  const deps = makeDeps(dom);
  const shell = createShell({
    ...deps,
    readAnchorFn: async () => ({ kind: "error", chainId: 8453, message: "boom" }),
  });

  await shell.loadReport("golden");
  assert.equal(dom.text("anchor-status"), "Anchor read failed");
  assert.equal(dom.text("anchor-contrast"), ANCHOR_CONTRAST.golden);
});

test("UX-2: an initial load failure clears the hard-coded 'connecting…' badge", async () => {
  const dom = new FakeDom();
  // The static markup ships live-status as "connecting…" (index.html); simulate it.
  dom.getElementById("live-status").textContent = "connecting…";
  const shell = createShell(makeDeps(dom, { failGolden: true }));

  await shell.loadReport("golden");

  assert.equal(dom.text("report-status"), "load failed");
  assert.equal(dom.text("report-hash"), "—");
  // The live panel must not sit at "connecting…" forever when the report fetch dies.
  assert.equal(
    dom.text("live-status"),
    "—",
    "live badge stuck at connecting… after failure (UX-2)",
  );
  assert.equal(dom.cls("live-status"), "badge neutral");
});
