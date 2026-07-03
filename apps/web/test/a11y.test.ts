import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Health-audit Product/UX (accessibility) finding: status transitions were
// silent to assistive tech. Every region the shell mutates (connecting→live→
// disconnected, the honesty banner, the report/anchor status) must be an
// aria-live region so a screen reader announces the change. Asserted against the
// static markup so a dropped attribute regresses loudly.

const HTML = readFileSync(join(import.meta.dirname, "..", "index.html"), "utf8");

for (const id of ["honesty-banner", "live-status", "report-status", "anchor-status"]) {
  test(`#${id} is an aria-live region`, () => {
    // The element with this id carries aria-live on the same tag.
    const tag = HTML.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `#${id} must exist in index.html`);
    assert.match(tag![0], /aria-live="polite"/, `#${id} must be aria-live="polite"`);
  });
}
