import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseSignature, serializeSignature, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalBytes } from "../src/canonical.ts";
import { validateLedger } from "../src/ledger.ts";
import { validateManifest } from "../src/manifest.ts";
import { canonicalReport, recon } from "../src/recon.ts";
import {
  type ReportBinding,
  type SignatureEnvelope,
  SECP256K1_HALF_N,
  bindingCovers,
  signReport,
  verifyReportSignature,
} from "../src/signature.ts";

// T9 / AC-2.7.a-b — detached EIP-712 author signature, checked separately from
// hash reproduction, low-s (EIP-2) enforced.

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const PK = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

function binding(): ReportBinding {
  return {
    reportHash: `0x${"ab".repeat(32)}` as Hex,
    subject: "0x1111111111111111111111111111111111111111",
    startBlock: 100n,
    endBlock: 200n,
    engineVersion: "0.1.0",
    chainId: 1n,
  };
}

test("signs and recovers to the declared author EOA", async () => {
  const env = await signReport(PK, binding());
  assert.equal(env.signer, privateKeyToAccount(PK).address);
  const check = await verifyReportSignature(env);
  assert.ok(check.ok, check.ok ? "" : check.reason);
  assert.equal(check.ok && check.signer, env.signer);
});

test("signing is deterministic (RFC-6979) — same key + binding → same signature", async () => {
  const a = await signReport(PK, binding());
  const b = await signReport(PK, binding());
  assert.equal(a.signature, b.signature);
});

test("viem produces a canonical low-s signature (s <= n/2)", async () => {
  const env = await signReport(PK, binding());
  const { s } = parseSignature(env.signature);
  assert.ok(BigInt(s) <= SECP256K1_HALF_N, "expected low-s from viem");
});

test("a tampered binding no longer recovers to the signer", async () => {
  const env = await signReport(PK, binding());
  const tampered: SignatureEnvelope = {
    ...env,
    binding: { ...env.binding, reportHash: `0x${"cd".repeat(32)}` as Hex },
  };
  const check = await verifyReportSignature(tampered);
  assert.ok(!check.ok);
});

test("a mis-declared signer fails verification", async () => {
  const env = await signReport(PK, binding());
  const wrong: SignatureEnvelope = { ...env, signer: "0x2222222222222222222222222222222222222222" };
  const check = await verifyReportSignature(wrong);
  assert.ok(!check.ok);
});

test("report.json canonical bytes are byte-identical signed-or-not (AC-2.7.a)", async () => {
  const readGolden = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`../fixtures/golden/${name}`, import.meta.url), "utf8"));
  const m = validateManifest(readGolden("manifest.json"));
  const l = validateLedger(readGolden("ledger.json"));
  assert.ok(m.ok && l.ok);
  const r = recon(m.value, l.value);
  assert.ok(r.ok);

  const bytesUnsigned = canonicalBytes(canonicalReport(r.value.report));
  // Signing produces a SIDECAR envelope; it must not touch the report bytes.
  const env = await signReport(PK, {
    reportHash: r.value.reportHash,
    subject: "0x1111111111111111111111111111111111111111",
    startBlock: m.value.startBlock,
    endBlock: m.value.endBlock,
    engineVersion: m.value.engineVersion,
    chainId: 1n,
  });
  const bytesSigned = canonicalBytes(canonicalReport(r.value.report));
  assert.deepEqual(bytesUnsigned, bytesSigned);
  assert.ok(env.signature.length > 2); // the signature lives only in the envelope
});

test("bindingCovers binds a signature to THIS report's identity (M2)", () => {
  const b = binding();
  assert.equal(bindingCovers(b, b), true);
  // A signature valid over a binding for a DIFFERENT report must not count.
  assert.equal(bindingCovers({ ...b, reportHash: `0x${"99".repeat(32)}` as Hex }, b), false);
  assert.equal(
    bindingCovers({ ...b, subject: "0x9999999999999999999999999999999999999999" }, b),
    false,
  );
  assert.equal(bindingCovers({ ...b, endBlock: b.endBlock + 1n }, b), false);
  assert.equal(bindingCovers({ ...b, engineVersion: "9.9.9" }, b), false);
});

test("a high-s signature is rejected (EIP-2), even though it is otherwise valid", async () => {
  const env = await signReport(PK, binding());
  const { r, s, yParity } = parseSignature(env.signature);
  // Reflect to the high-s equivalent: s' = n - s, flip recovery parity.
  const highS = SECP256K1_N - BigInt(s);
  const malleable = serializeSignature({
    r,
    s: toHex(highS, { size: 32 }),
    yParity: yParity === 0 ? 1 : 0,
  });
  const check = await verifyReportSignature({ ...env, signature: malleable });
  assert.ok(!check.ok);
  assert.match(check.ok ? "" : check.reason, /high-s/);
});
