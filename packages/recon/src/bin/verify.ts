import { readFileSync } from "node:fs";
import { mainnetClient, DEFAULT_BLOCKS_PER_CHUNK } from "../rpc.ts";
import { canonicalBytes } from "../canonical.ts";
import { validateLedger, ledgerHash } from "../ledger.ts";
import { manifestHash } from "../manifest.ts";
import { canonicalReport, recon } from "../recon.ts";
import { reconstructManifest } from "../reconstruct.ts";
import {
  type ReportBinding,
  type SignatureEnvelope,
  bindingCovers,
  verifyReportSignature,
} from "../signature.ts";
import { isPlainObject, parseNonNegInt } from "../validate.ts";
import { DATA_CHAIN_ID } from "../filter.ts";
import { ENGINE_VERSION } from "../version.ts";

/**
 * `tieout verify` — strong verify by re-derivation (AD-8/AD-10, FR3/FR4). Given a
 * shipped `report.json` + its `ledger.json`, it re-fetches the manifest from an
 * L0 RPC re-fetch over the report's pinned range, confirms `manifestHash`, runs
 * the pure `recon`, and confirms `reportHash` — trusting neither the adviser nor
 * a custodial API. It asserts `engineVersion` FIRST, so a mismatch surfaces as
 * version skew, not a bare hash failure. The detached author signature (if
 * present) is checked on a SEPARATE line and never blocks hash reproduction.
 *
 *   ETH_RPC_URL=... node src/bin/verify.ts <report.json> <ledger.json> [report.sig.json]
 *
 * Exit 0 on full reproduction; 2 on usage; 1 on any typed failure.
 */

function fail(message: string): number {
  process.stderr.write(`verify: ${message}\n`);
  return 1;
}

/** Parse a detached signature envelope sidecar (bigint fields as strings). */
function parseEnvelope(raw: unknown): SignatureEnvelope {
  const o = raw as Record<string, unknown>;
  const b = o["binding"] as Record<string, unknown>;
  return {
    signer: o["signer"] as `0x${string}`,
    signature: o["signature"] as `0x${string}`,
    binding: {
      reportHash: b["reportHash"] as `0x${string}`,
      subject: b["subject"] as `0x${string}`,
      startBlock: BigInt(b["startBlock"] as string),
      endBlock: BigInt(b["endBlock"] as string),
      engineVersion: b["engineVersion"] as string,
      chainId: BigInt(b["chainId"] as string),
    },
  };
}

async function main(): Promise<number> {
  const [reportPath, ledgerPath, sigPath] = process.argv.slice(2);
  if (reportPath === undefined || ledgerPath === undefined) {
    process.stderr.write("usage: verify <report.json> <ledger.json> [report.sig.json]\n");
    return 2;
  }
  const rpc = process.env.ETH_RPC_URL;
  if (rpc === undefined) return fail("ETH_RPC_URL not set");
  // Validate VERIFY_CHUNK env is a positive integer before use (never crash on a
  // slip). [Review L4]
  const chunkRaw = process.env.VERIFY_CHUNK ?? String(DEFAULT_BLOCKS_PER_CHUNK);
  if (!/^[0-9]+$/.test(chunkRaw) || BigInt(chunkRaw) < 1n) {
    return fail(`VERIFY_CHUNK must be a positive integer (got "${chunkRaw}")`);
  }
  const blocksPerChunk = BigInt(chunkRaw);

  let reportBytes: Buffer;
  let report: Record<string, unknown>;
  try {
    reportBytes = readFileSync(reportPath);
    report = JSON.parse(reportBytes.toString("utf8")) as Record<string, unknown>;
  } catch (caught) {
    return fail(`cannot read/parse ${reportPath}: ${(caught as Error).message}`);
  }

  // Structural guard: a malformed/foreign report.json must fail cleanly (exit 1),
  // never crash the trustless verifier with a stack trace. [Review L3]
  const pinsRaw = report["pins"];
  if (
    typeof report["engineVersion"] !== "string" ||
    typeof report["manifestHash"] !== "string" ||
    typeof report["ledgerHash"] !== "string" ||
    typeof report["subject"] !== "string" ||
    !isPlainObject(pinsRaw) ||
    typeof pinsRaw["startBlock"] !== "string" ||
    typeof pinsRaw["endBlock"] !== "string" ||
    typeof pinsRaw["startHash"] !== "string" ||
    typeof pinsRaw["endHash"] !== "string"
  ) {
    return fail(
      "malformed report.json (missing/invalid engineVersion, pins, manifestHash, ledgerHash, or subject)",
    );
  }
  const pins = pinsRaw as Record<string, string>;

  // The block pins are the only structural fields fed to `BigInt()`. Route them
  // through the same `parseNonNegInt` every other input boundary uses, INSIDE the
  // guard — `BigInt("abc")` throws a SyntaxError and `BigInt("-5")` silently
  // succeeds, so a bare cast here would crash (or admit a negative block) exactly
  // where the comment above promises a clean typed failure. [REL-1]
  const startBlockR = parseNonNegInt(pins["startBlock"], "pins.startBlock");
  if (!startBlockR.ok) return fail(`malformed report.json (${startBlockR.error.message})`);
  const endBlockR = parseNonNegInt(pins["endBlock"], "pins.endBlock");
  if (!endBlockR.ok) return fail(`malformed report.json (${endBlockR.error.message})`);
  const startBlock = startBlockR.value;
  const endBlock = endBlockR.value;

  // 1) engineVersion FIRST — a mismatch is version skew, not a hash failure (AD-8).
  if (report["engineVersion"] !== ENGINE_VERSION) {
    return fail(
      `version skew: report engineVersion "${String(report["engineVersion"])}" != verifier ${ENGINE_VERSION}`,
    );
  }

  // 2) L0 re-fetch + re-derive over the report's pinned range.
  const client = mainnetClient(rpc);
  const reconstructed = await reconstructManifest(client, {
    startBlock,
    endBlock,
    blocksPerChunk,
  });
  if (!reconstructed.ok) return fail(`reconstruct failed: ${JSON.stringify(reconstructed.error)}`);
  const { manifest } = reconstructed.value;

  // 3) Confirm manifestHash and the both-endpoint blockhash pins (AD-3/AD-10).
  if (manifestHash(manifest) !== report["manifestHash"]) {
    return fail(
      `manifestHash mismatch: re-derived ${manifestHash(manifest)} != report ${String(report["manifestHash"])}`,
    );
  }
  if (manifest.startHash !== pins["startHash"] || manifest.endHash !== pins["endHash"]) {
    return fail("pin blockhash mismatch — the report's pins disagree with the honest RPC (AD-10)");
  }

  // 4) Ledger hash.
  let ledgerRaw: unknown;
  try {
    ledgerRaw = JSON.parse(readFileSync(ledgerPath, "utf8")) as unknown;
  } catch (caught) {
    return fail(`cannot read/parse ${ledgerPath}: ${(caught as Error).message}`);
  }
  const ledger = validateLedger(ledgerRaw);
  if (!ledger.ok) return fail(`ledger invalid: [${ledger.error.code}] ${ledger.error.message}`);
  if (ledgerHash(ledger.value) !== report["ledgerHash"]) {
    return fail(
      `ledgerHash mismatch: ${ledgerHash(ledger.value)} != report ${String(report["ledgerHash"])}`,
    );
  }

  // 5) recon → confirm reportHash by BYTE-IDENTITY with the shipped report.json.
  // Byte-identity IS the reportHash proof: reportHash = keccak256(canonicalBytes
  // (report)) and report.json on disk is those exact canonical bytes (AD-11/AD-12),
  // so equal bytes ⇒ equal hash. A separate `reportHash != keccak256(reportBytes)`
  // re-check would be unreachable after the byte compare (it could only fire if
  // keccak256 were non-deterministic within one process), so it is intentionally
  // omitted rather than left as a dead branch (code-review 2026-07-07 #8).
  const result = recon(manifest, ledger.value);
  if (!result.ok) return fail(`recon failed: [${result.error.code}] ${result.error.message}`);
  const reproBytes = canonicalBytes(canonicalReport(result.value.report));
  if (Buffer.compare(Buffer.from(reproBytes), reportBytes) !== 0) {
    return fail("report bytes differ — re-derivation did not reproduce report.json (NFR-0 break)");
  }

  process.stdout.write(`✅ manifestHash reproduced: ${manifestHash(manifest)}\n`);
  process.stdout.write(`✅ reportHash reproduced:   ${result.value.reportHash}\n`);
  process.stdout.write(
    "note: a reproduced hash attests the onchain-derived position + commitment, NOT the honesty of the private books (AD-16).\n",
  );

  // 6) Detached author signature — a SEPARATE line; never blocks the above (AD-19).
  if (sigPath !== undefined) {
    try {
      const env = parseEnvelope(JSON.parse(readFileSync(sigPath, "utf8")) as unknown);
      const expected: ReportBinding = {
        reportHash: result.value.reportHash,
        subject: report["subject"] as `0x${string}`,
        startBlock,
        endBlock,
        engineVersion: report["engineVersion"] as string,
        chainId: BigInt(DATA_CHAIN_ID),
      };
      // The signature must cover THIS report's identity, not merely be valid over
      // its own binding — else an unrelated valid signature would falsely attest
      // this report. [Review M2]
      if (!bindingCovers(env.binding, expected)) {
        process.stdout.write(
          "⚠️  signature: does NOT cover this report (binding mismatch) — ignored\n",
        );
      } else {
        const check = await verifyReportSignature(env);
        process.stdout.write(
          check.ok
            ? `✅ signature: valid, author ${check.signer} (non-repudiation only)\n`
            : `⚠️  signature: INVALID (${check.reason}) — does not affect hash reproduction\n`,
        );
      }
    } catch (caught) {
      process.stdout.write(`⚠️  signature: unreadable envelope (${(caught as Error).message})\n`);
    }
  }
  return 0;
}

process.exit(await main());
