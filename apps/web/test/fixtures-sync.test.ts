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
