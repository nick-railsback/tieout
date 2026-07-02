import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, toBytes } from "viem";
import { canonicalBytes, canonicalHash, canonicalize } from "../src/canonical.ts";

// T3 / AC-1.3 — the single canonicalizer + keccak binding module.

test("JCS sorts object keys by UTF-16 code unit; arrays keep their order", () => {
  assert.equal(canonicalize({ b: 2n, a: 1n, c: 3n }), '{"a":"1","b":"2","c":"3"}');
  // Arrays are NOT sorted — the producer declares the order (AD-4/AD-13).
  assert.equal(canonicalize([3n, 1n, 2n]), '["3","1","2"]');
});

test("integers emit as quoted decimal strings, never JSON numbers (AD-11)", () => {
  assert.equal(canonicalize({ n: 1_000_000_000_000_000_000n }), '{"n":"1000000000000000000"}');
  assert.equal(canonicalize(-5n), '"-5"');
});

test("float / JSON-number on the canonical path fails loudly (AD-2)", () => {
  // @ts-expect-error a JS number is not a CanonicalValue by construction.
  assert.throws(() => canonicalize({ x: 1 }), /unsupported value of type "number"/);
  // @ts-expect-error
  assert.throws(() => canonicalize(1.5), /unsupported value of type "number"/);
});

test("no BOM and no trailing newline (AD-11)", () => {
  const serialized = canonicalize({ a: 1n, z: [true, null, false] });
  assert.equal(serialized.charCodeAt(0), 0x7b); // '{'
  assert.equal(serialized.at(-1), "}");
  assert.ok(!serialized.startsWith("﻿"));
  assert.ok(!serialized.endsWith("\n"));
});

test("strings are NFC-normalized before hashing (AD-11)", () => {
  const nfd = "é"; // 'e' + combining acute
  const nfc = "é"; // 'é'
  assert.notEqual(nfd, nfc);
  assert.equal(canonicalize(nfd), canonicalize(nfc));
  assert.equal(canonicalHash({ v: nfd }), canonicalHash({ v: nfc }));
});

test("object keys are NFC-normalized BEFORE ordering; NFC-colliding keys are rejected (F1)", () => {
  // U+212B (ANGSTROM SIGN) and U+00C5 both NFC-normalize to U+00C5 — emitting
  // both would produce a duplicate object key, so reject it loudly.
  assert.throws(
    () => canonicalize({ "Å": 1n, "Å": 2n }),
    /duplicate object key .* after NFC normalization/,
  );
  // An NFD key is normalized to its NFC form on emit (é = U+00E9).
  assert.equal(canonicalize({ "é": 1n }), '{"é":"1"}');
});

test("canonicalBytes is a pure UTF-8 encode — viem's 0x-hex branch never fires (AC-1.3.c)", () => {
  const value = { hello: "world", n: 42n, hex: "0xabc" };
  assert.deepEqual(canonicalBytes(value), new TextEncoder().encode(canonicalize(value)));
});

test("keccak256 (not NIST SHA3) — golden byte string hashes to a pinned digest (AC-1.3.c)", () => {
  const value = { a: 1n, b: "0xabc", c: [true, null] };
  const serialized = canonicalize(value);
  assert.equal(serialized, '{"a":"1","b":"0xabc","c":[true,null]}');
  assert.equal(canonicalHash(value), keccak256(toBytes(serialized)));
  assert.equal(
    canonicalHash(value),
    "0x17a0c6ab7b8ecb60a9c9d8d04268e5b55b1bd70ab05c495b2ec5cff566e0d9b1",
  );
});

test("hashing is independent of input key order (AC-1.2.c property, at the core)", () => {
  const a = canonicalHash({ one: 1n, two: 2n, three: 3n });
  const b = canonicalHash({ three: 3n, one: 1n, two: 2n });
  assert.equal(a, b);
});

// A seeded property/fuzz over the canonicalizer (no external deps): for many
// randomly-generated canonical objects, the hash must be invariant under key
// permutation. Deterministic PRNG so the fuzz itself is reproducible (NFR-0
// discipline applied to the test).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCanonicalObject(rng: () => number): Record<string, bigint | string | boolean> {
  const keyPool = ["alpha", "beta", "gamma", "delta", "shares", "block", "hash", "É", "a", "z"];
  const count = 1 + Math.floor(rng() * 6);
  const object: Record<string, bigint | string | boolean> = {};
  for (let i = 0; i < count; i++) {
    const key = `${keyPool[Math.floor(rng() * keyPool.length)]!}${i}`;
    const kind = Math.floor(rng() * 3);
    object[key] =
      kind === 0
        ? BigInt(Math.floor(rng() * 1e15))
        : kind === 1
          ? `0x${Math.floor(rng() * 1e9).toString(16)}`
          : rng() > 0.5;
  }
  return object;
}

test("property/fuzz — canonicalHash is invariant under key permutation (seeded, 200 cases)", () => {
  const rng = mulberry32(0x71_65_6f_75); // "tieou" — fixed seed, reproducible fuzz
  for (let i = 0; i < 200; i++) {
    const object = randomCanonicalObject(rng);
    const shuffled = Object.fromEntries(
      Object.entries(object).sort(() => (rng() > 0.5 ? 1 : -1)),
    ) as typeof object;
    assert.equal(
      canonicalHash(object),
      canonicalHash(shuffled),
      `case ${i}: hash changed under key permutation`,
    );
  }
});
