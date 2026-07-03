import { keccak256, toBytes, type Hex } from "viem";

/**
 * The ONE canonicalizer + keccak binding module (AD-11/AD-12). Every producer
 * — `recon`, `derivation`, `verify` — hashes through here; there is no second
 * serializer. Keeping a single module is what makes NFR-0 (byte-identical
 * `reportHash` on two independent machines) provable.
 *
 * The byte contract (RFC-8785 / JCS):
 *  - object keys sorted by UTF-16 code unit; arrays keep their given order
 *    (JCS does NOT sort arrays, so every producer declares a total order —
 *    AD-4/AD-13);
 *  - strings NFC-normalized and JSON-escaped;
 *  - integers emitted as decimal strings via `BigInt#toString(10)`, NEVER as
 *    JSON numbers (AD-2/AD-11);
 *  - no BOM, no trailing newline;
 *  - the bytes hashed are byte-identical to the bytes written to disk (AD-11).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-11]
 */

/**
 * A value admissible on the canonical path. Note the deliberate absence of
 * `number`: every integer is a `bigint` (emitted as a decimal string). A JSON
 * number or float reaching the serializer is a contract breach (AD-2), caught
 * at runtime by {@link canonicalize}.
 */
export type CanonicalValue =
  | string
  | boolean
  | null
  | bigint
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/**
 * Compare two strings by UTF-16 code unit — exactly the RFC-8785 property-name
 * ordering. (JavaScript's default `<` on strings already compares by code
 * unit; this is the explicit, self-documenting form.)
 *
 * This is the single source of the ordering primitive: this module owns the JCS
 * byte contract, and the declared array-order validators (manifest/ledger/recon)
 * import it from here so canonical key-sort and array-order validation can never
 * drift apart. Do not re-implement it elsewhere.
 */
export function compareCodeUnits(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const delta = a.charCodeAt(i) - b.charCodeAt(i);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

/**
 * Serialize one value to its RFC-8785 (JCS) canonical JSON string. Pure, and
 * with no BOM or trailing newline. `JSON.stringify` on a single string yields
 * exactly the JCS string production (minimal escaping, non-ASCII left literal,
 * lone surrogates escaped), so we lean on it for the leaf string case only.
 */
export function canonicalize(value: CanonicalValue): string {
  switch (typeof value) {
    case "string":
      return JSON.stringify(value.normalize("NFC"));
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      // Decimal string, quoted — never a JSON number (AD-2/AD-11).
      return JSON.stringify(value.toString(10));
    case "object": {
      if (value === null) return "null";
      if (Array.isArray(value)) {
        return `[${value.map((element) => canonicalize(element)).join(",")}]`;
      }
      const object = value as { readonly [key: string]: CanonicalValue };
      // NFC-normalize keys BEFORE ordering (AD-11): the string used for the
      // code-unit sort must be the same string that is emitted, or the output
      // can violate JCS key order. Two distinct raw keys that normalize to the
      // same string would also emit a duplicate object key — reject that.
      const seen = new Set<string>();
      const members = Object.keys(object)
        .map((rawKey) => {
          const key = rawKey.normalize("NFC");
          if (seen.has(key)) {
            throw new TypeError(
              `canonicalize: duplicate object key "${key}" after NFC normalization`,
            );
          }
          seen.add(key);
          return { key, member: object[rawKey] as CanonicalValue };
        })
        .sort((a, b) => compareCodeUnits(a.key, b.key))
        .map(({ key, member }) => `${JSON.stringify(key)}:${canonicalize(member)}`);
      return `{${members.join(",")}}`;
    }
    default:
      // number | undefined | function | symbol — `number` is the AD-2 float /
      // JSON-number breach; the rest are programmer error. Fail loudly rather
      // than emit silently-wrong bytes.
      throw new TypeError(
        `canonicalize: unsupported value of type "${typeof value}". The canonical ` +
          "path admits only string | boolean | null | bigint | array | object " +
          "(integers must be bigint, never number — AD-2/AD-11).",
      );
  }
}

/**
 * The exact UTF-8 bytes that get hashed AND written to disk (AD-11, AC-1.3.d).
 *
 * viem's `toBytes` UTF-8-encodes a non-`0x` string; canonical JSON always
 * begins with a structural byte (`{`, `[`, or `"`), never `0x`, so the hex
 * branch never fires (AC-1.3.c).
 * [viem@2.54.1 src/utils/encoding/toBytes.ts#L54-L175]
 */
export function canonicalBytes(value: CanonicalValue): Uint8Array {
  return toBytes(canonicalize(value));
}

/**
 * `keccak256(canonicalBytes(value))` — Ethereum keccak256 (viem), NOT NIST
 * SHA3-256 (AD-12). viem's `keccak256` accepts only `Hex | ByteArray`, which is
 * why the canonical string is converted through {@link canonicalBytes} first.
 * [viem@2.54.1 src/utils/hash/keccak256.ts#L21-L31]
 */
export function canonicalHash(value: CanonicalValue): Hex {
  return keccak256(canonicalBytes(value));
}
