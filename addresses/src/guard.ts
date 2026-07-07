import { getAddress, isAddress } from "viem";
import { ADDRESS_TABLE, ADDRESS_KINDS, type AddressEntry } from "./index.ts";

/**
 * The AD-5 build-time address guard. For each entry it asserts: the stored
 * `address` is a well-formed lowercase address; the `checksummed` sibling is a
 * valid EIP-55 form (`getAddress(checksummed) === checksummed`); `address`
 * equals `checksummed.toLowerCase()`; and the table holds its deterministic
 * `(chainId, address)` order.
 *
 * Why the EIP-55 check lives on `checksummed`, not `address` (SEC-1): for ANY
 * well-formed lowercase hex, `getAddress(x).toLowerCase() === x` holds — even
 * for a transposed-digit wrong address — so round-tripping the lowercase form is
 * a tautology that detects nothing. The mixed-case `checksummed` form, by
 * contrast, encodes a hash-derived case pattern; a single mistyped nibble no
 * longer matches its own EIP-55 checksum and fails the build.
 *
 * Per the viem behaviour confirmed against the installed viem 2.54.1 source:
 *  - the EIP-1191 `chainId` argument is NEVER passed — those checksums are not
 *    ecosystem-compatible [viem@2.54.1 getAddress.ts#L20-L81];
 *  - the `isAddress` pre-check on `address` passes `{ strict: false }` per the
 *    AD-5 convention and to state intent (an all-lowercase address is valid
 *    under EITHER strict mode in viem 2.54.1; the strict default only rejects
 *    *mixed-case* inputs that fail their own checksum).
 */
export type AddressCheckError = { readonly entry: AddressEntry; readonly reason: string };

export function checkAddressTable(
  table: readonly AddressEntry[] = ADDRESS_TABLE,
): AddressCheckError[] {
  const errors: AddressCheckError[] = [];

  for (const entry of table) {
    if (!(ADDRESS_KINDS as readonly string[]).includes(entry.kind)) {
      errors.push({
        entry,
        reason: `invalid kind ${String(entry.kind)} (expected ${ADDRESS_KINDS.join("|")})`,
      });
    }
    if (!isAddress(entry.address, { strict: false })) {
      errors.push({ entry, reason: "not a well-formed address" });
      continue;
    }
    if (entry.address !== entry.address.toLowerCase()) {
      errors.push({ entry, reason: "stored address is not lowercase (AD-5)" });
    }
    // The REAL EIP-55 error detection lives on the `checksummed` form, not on
    // `address`. `getAddress(entry.address).toLowerCase() === entry.address` is a
    // tautology for any well-formed lowercase hex — it can never catch a wrong
    // address (SEC-1). Instead, re-derive the canonical checksum FROM the stored
    // checksummed form: a single mistyped nibble there yields a different
    // case-pattern and fails this equality, breaking the build.
    let canonical: string;
    try {
      canonical = getAddress(entry.checksummed); // never pass the EIP-1191 chainId
    } catch (caught) {
      errors.push({
        entry,
        reason: `checksummed is not a well-formed address: ${(caught as Error).message}`,
      });
      continue;
    }
    if (entry.checksummed !== canonical) {
      errors.push({
        entry,
        reason: `checksummed is not its own EIP-55 form — a mistyped nibble? expected ${canonical}`,
      });
    }
    if (entry.address !== entry.checksummed.toLowerCase()) {
      errors.push({
        entry,
        reason: `stored address is not the lowercase of checksummed (${entry.checksummed})`,
      });
    }
  }

  // Deterministic order: (chainId, address), strictly increasing.
  for (let i = 1; i < table.length; i++) {
    const prev = table[i - 1]!;
    const curr = table[i]!;
    const ordered =
      prev.chainId < curr.chainId || (prev.chainId === curr.chainId && prev.address < curr.address);
    if (!ordered) {
      errors.push({ entry: curr, reason: "table is not ordered by (chainId, address) (AD-5)" });
    }
  }

  return errors;
}

/** Throw if the table fails the AD-5 guard. Used by the build-time check. */
export function assertAddressTable(): void {
  const errors = checkAddressTable();
  if (errors.length > 0) {
    const detail = errors
      .map(
        (error) =>
          `  - ${error.entry.symbol}@${error.entry.chainId} ${error.entry.address}: ${error.reason}`,
      )
      .join("\n");
    throw new Error(`AD-5 address table check failed:\n${detail}`);
  }
}
