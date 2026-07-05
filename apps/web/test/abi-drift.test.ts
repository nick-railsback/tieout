import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ATTESTATION_REGISTRY_ABI_SIGNATURES } from "../src/abi.ts";

// Health-audit DRY finding (DRY-3): apps/web hand-mirrors the AttestationRegistry
// ABI across the Node/Foundry boundary, where no compile-time link exists — a
// Solidity signature change would leave the web ABI silently stale, surfacing
// only as the web's error state. Bind the mirror to the committed Solidity source:
// each mirrored signature must still appear in AttestationRegistry.sol, so drift
// (a changed param or return type) fails the Node suite loudly.

const SOURCE = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "packages", "contracts", "src", "AttestationRegistry.sol"),
  "utf8",
);

/** The contract source with all runs of whitespace collapsed, so a multi-line
 * declaration matches its one-line human-readable form. */
const FLAT_SOURCE = SOURCE.replace(/\s+/g, " ");

test("DRY-3: the web AttestationRegistry ABI matches the Solidity source", () => {
  for (const signature of ATTESTATION_REGISTRY_ABI_SIGNATURES) {
    // Solidity declares these `external view`; the human-readable ABI omits the
    // visibility keyword, so re-insert it to reconstruct the exact source form.
    const expected = signature.replace(") view returns", ") external view returns");
    assert.ok(
      FLAT_SOURCE.includes(expected),
      `AttestationRegistry.sol no longer declares "${expected}" — the web ABI has drifted from the contract`,
    );
  }
});
