import { type Result, ok, err } from "./result.ts";

/**
 * A structured validation failure. The pure core returns these as values; it
 * does not throw (spine Consistency Conventions). `path` locates the offending
 * field (e.g. `lots[2].shares`), `""` for the root.
 */
export type FieldError = {
  readonly code: string;
  readonly message: string;
  readonly path: string;
};

export const fail = (code: string, message: string, path: string): Result<never, FieldError> =>
  err({ code, message, path });

/** Decimal-string integer form required on the canonical path (AC-1.2.a). */
export const DECIMAL_INT = /^-?[0-9]+$/;
/** Lowercase, `0x`-prefixed, fixed-width 20-byte address (AD-5/AD-11). */
export const ADDRESS = /^0x[0-9a-f]{40}$/;
/** Lowercase, `0x`-prefixed, fixed-width 32-byte hash (AD-11). */
export const BYTES32 = /^0x[0-9a-f]{64}$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse a non-negative integer supplied as a decimal string. Rejects, in AD
 * terms:
 *  - a JSON *number* integer/float (must be a decimal string — AD-11);
 *  - a non-`^-?[0-9]+$` string (a float like `"1.5"` fails here — AD-2);
 *  - a negative value (canonical quantities are non-negative — AD-2).
 */
export function parseNonNegInt(input: unknown, path: string): Result<bigint, FieldError> {
  if (typeof input === "number") {
    return fail(
      "json-number-integer",
      `${path}: integers must be decimal strings, not JSON numbers (AD-11)`,
      path,
    );
  }
  if (typeof input !== "string") {
    return fail("bad-type", `${path}: expected a decimal string`, path);
  }
  if (!DECIMAL_INT.test(input)) {
    return fail(
      "not-decimal-string",
      `${path}: not a ^-?[0-9]+$ decimal string (AD-2/AD-11)`,
      path,
    );
  }
  const parsed = BigInt(input);
  if (parsed < 0n) {
    return fail("negative", `${path}: must be non-negative (AD-2)`, path);
  }
  return ok(parsed);
}

export function parseLowerAddress(input: unknown, path: string): Result<string, FieldError> {
  if (typeof input !== "string") {
    return fail("bad-type", `${path}: expected an address string`, path);
  }
  if (!ADDRESS.test(input)) {
    return fail(
      "bad-address",
      `${path}: must be a lowercase 0x-prefixed 20-byte address (AD-5)`,
      path,
    );
  }
  return ok(input);
}

export function parseBytes32(input: unknown, path: string): Result<string, FieldError> {
  if (typeof input !== "string") {
    return fail("bad-type", `${path}: expected a 0x hash string`, path);
  }
  if (!BYTES32.test(input)) {
    return fail("bad-hash", `${path}: must be a lowercase 0x-prefixed 32-byte hash (AD-11)`, path);
  }
  return ok(input);
}

export function parseNonEmptyString(input: unknown, path: string): Result<string, FieldError> {
  if (typeof input !== "string" || input.length === 0) {
    return fail("bad-type", `${path}: expected a non-empty string`, path);
  }
  return ok(input);
}
