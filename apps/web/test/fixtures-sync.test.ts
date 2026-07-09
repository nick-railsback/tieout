import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalHash, canonicalReport, parseReportJson } from "@tieout/recon";

// Health-audit DRY finding: the web public/ report fixtures are hand-copies of
// the recon fixtures with no sync step, so a recon fixture regeneration (as in
// the ENGINE_VERSION bump) leaves the web copies stale silently — and the view
// tests keep passing against the stale copy. This binds them: each public copy
// must be byte-identical to its recon source, and each hash file must equal the
// reportHash recomputed from that report. Any drift fails loudly here.

const PUBLIC = join(import.meta.dirname, "..", "public");
const FIXTURES = join(import.meta.dirname, "..", "..", "..", "packages", "recon", "fixtures");

const read = (path: string) => readFileSync(path, "utf8");
const reportHashOf = (json: string) =>
  canonicalHash(canonicalReport(parseReportJson(JSON.parse(json))));

for (const [key, dir] of [
  ["golden", "golden"],
  ["slice", "slice"],
] as const) {
  test(`web report.${key}.json is byte-identical to the recon fixture`, () => {
    const web = read(join(PUBLIC, `report.${key}.json`));
    const recon = read(join(FIXTURES, dir, "report.json"));
    assert.equal(
      web,
      recon,
      `apps/web/public/report.${key}.json is stale vs packages/recon/fixtures/${dir}/report.json`,
    );
  });

  test(`web report.${key}.hash.txt matches the report's recomputed reportHash`, () => {
    const web = read(join(PUBLIC, `report.${key}.json`));
    const committedHash = read(join(PUBLIC, `report.${key}.hash.txt`)).trim();
    assert.equal(
      committedHash,
      reportHashOf(web),
      `report.${key}.hash.txt does not match its report`,
    );
  });
}

// The golden report additionally has a recon-side reportHash.txt — pin them equal.
test("web golden hash equals the recon golden reportHash.txt", () => {
  const web = read(join(PUBLIC, "report.golden.hash.txt")).trim();
  const recon = read(join(FIXTURES, "golden", "reportHash.txt")).trim();
  assert.equal(web, recon);
});

// Review 2026-07-09 #3/#4 — the same DRY class as the fixtures above, but for
// COPY: the verify command and the deliberately-not-built list are hand-written
// on both the pinned page and the README, with the page linking the README as
// "the long version". These constants are the single source; both files must
// carry them verbatim, so a change in either fails loudly here instead of
// shipping a diverged immutable pin.

const ROOT = join(import.meta.dirname, "..", "..", "..");
const decodeEntities = (html: string) =>
  html.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const collapse = (s: string) => s.replace(/\s+/g, " ");

const VERIFY_COMMAND = `ETH_RPC_URL=<mainnet-archive-rpc-url> \\
  pnpm --filter @tieout/recon verify \\
  fixtures/slice/report.json fixtures/slice/ledger.json`;

const PARKED_LIST =
  "wallet connect, client-side report generation, in-browser verify, downloadable reports, address lookup";

test("the verify command is identical on the page and in the README", () => {
  const page = decodeEntities(read(join(import.meta.dirname, "..", "index.html")));
  const readme = read(join(ROOT, "README.md"));
  assert.ok(page.includes(VERIFY_COMMAND), "index.html verify command drifted");
  assert.ok(readme.includes(VERIFY_COMMAND), "README verify command drifted");
});

test("the deliberately-not-built list is identical on the page and in the README", () => {
  const page = collapse(read(join(import.meta.dirname, "..", "index.html")));
  const readme = collapse(read(join(ROOT, "README.md")));
  assert.ok(page.includes(PARKED_LIST), "index.html parked list drifted");
  assert.ok(readme.includes(PARKED_LIST), "README parked list drifted");
});
