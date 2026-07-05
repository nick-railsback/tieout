import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createShell, type ShellDeps, type ShellDom, type ShellElement } from "../src/shell.ts";
import type { AnchorState } from "../src/view.ts";

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
    return match ? this.buttons.find((b) => b.dataset["report"] === match[1]) ?? null : null;
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

const notDeployed: AnchorState = { kind: "not-deployed", chainId: 8453 };

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
  assert.equal(dom.text("report-hash"), "—", "stale report hash left under load-failed badge (UX-1)");
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

test("UX-2: an initial load failure clears the hard-coded 'connecting…' badge", async () => {
  const dom = new FakeDom();
  // The static markup ships live-status as "connecting…" (index.html); simulate it.
  dom.getElementById("live-status").textContent = "connecting…";
  const shell = createShell(makeDeps(dom, { failGolden: true }));

  await shell.loadReport("golden");

  assert.equal(dom.text("report-status"), "load failed");
  assert.equal(dom.text("report-hash"), "—");
  // The live panel must not sit at "connecting…" forever when the report fetch dies.
  assert.equal(dom.text("live-status"), "—", "live badge stuck at connecting… after failure (UX-2)");
  assert.equal(dom.cls("live-status"), "badge neutral");
});
