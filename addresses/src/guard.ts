import { getAddress, isAddress } from "viem";
import { ADDRESS_TABLE, ADDRESS_KINDS, type AddressEntry } from "./index.ts";

/**
 * The AD-5 build-time address guard. Each stored lowercase address must
 * round-trip to its EIP-55 checksum via viem `getAddress` (a throw is a check
 * failure), the stored form must be exactly the lowercase of that checksum, and
 * the table must hold its deterministic `(chainId, address)` order.
 *
 * Per the viem behaviour confirmed against the installed viem 2.54.1 source:
 *  - the EIP-1191 `chainId` argument is NEVER passed — those checksums are not
 *    ecosystem-compatible [viem@2.54.1 getAddress.ts#L20-L81];
 *  - the `isAddress` pre-check passes `{ strict: false }` per the AD-5
 *    convention and to state intent. NB: an all-lowercase address is actually
 *    valid under EITHER strict mode in viem 2.54.1 (it short-circuits before
 *    the checksum test); the strict default only rejects *mixed-case* inputs
 *    that fail their own checksum. The real correctness check here is the
 *    `getAddress` round-trip below, not the pre-check.
 */
export type AddressCheckError = { readonly entry: AddressEntry; readonly reason: string };

export function checkAddressTable(): AddressCheckError[] {
  const errors: AddressCheckError[] = [];

  for (const entry of ADDRESS_TABLE) {
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
    let checksum: string;
    try {
      checksum = getAddress(entry.address); // never pass the EIP-1191 chainId
    } catch (caught) {
      errors.push({ entry, reason: `getAddress threw: ${(caught as Error).message}` });
      continue;
    }
    if (entry.address !== checksum.toLowerCase()) {
      errors.push({
        entry,
        reason: `stored form is not the lowercase of its EIP-55 checksum (${checksum})`,
      });
    }
  }

  // Deterministic order: (chainId, address), strictly increasing.
  for (let i = 1; i < ADDRESS_TABLE.length; i++) {
    const prev = ADDRESS_TABLE[i - 1]!;
    const curr = ADDRESS_TABLE[i]!;
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
      .map((error) => `  - ${error.entry.symbol}@${error.entry.chainId} ${error.entry.address}: ${error.reason}`)
      .join("\n");
    throw new Error(`AD-5 address table check failed:\n${detail}`);
  }
}
