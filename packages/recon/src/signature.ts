import {
  type Address,
  type Hex,
  type TypedDataDomain,
  parseSignature,
  verifyTypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Detached EIP-712 author signature (AD-19). The signature binds the author to a
 * report's `reportHash` (plus the window/subject/engine context) WITHOUT ever
 * entering the canonical hashed bytes: it lives in a sidecar envelope, so
 * `report.json` is byte-identical whether or not the report was signed. A valid
 * signature adds the signer's non-repudiation — never correctness, and never any
 * claim about the honesty of the private books (AD-16). `verify` checks it on a
 * line separate from hash reproduction; an absent/invalid signature does not
 * block hash reproduction.
 *
 * MVP scope is an EOA recovered via `ecrecover` (viem `verifyTypedData`),
 * accepting ONLY a canonical low-s (EIP-2) signature so exactly one valid form
 * exists. ERC-1271 / smart-account signatures are out of scope (Deferred).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-19]
 */

export const TIEOUT_DOMAIN_NAME = "Tieout";
export const TIEOUT_DOMAIN_VERSION = "1";

/** secp256k1 order n. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/** floor(n/2) — the EIP-2 low-s boundary. `s` must be <= this. */
export const SECP256K1_HALF_N = SECP256K1_N / 2n;

/** The typed struct the author signs (AD-19). */
export type ReportBinding = {
  readonly reportHash: Hex;
  readonly subject: Address;
  readonly startBlock: bigint;
  readonly endBlock: bigint;
  readonly engineVersion: string;
  readonly chainId: bigint;
};

const REPORT_TYPES = {
  Report: [
    { name: "reportHash", type: "bytes32" },
    { name: "subject", type: "address" },
    { name: "startBlock", type: "uint256" },
    { name: "endBlock", type: "uint256" },
    { name: "engineVersion", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
} as const;

function tieoutDomain(chainId: bigint): TypedDataDomain {
  return { name: TIEOUT_DOMAIN_NAME, version: TIEOUT_DOMAIN_VERSION, chainId: Number(chainId) };
}

/** The detached signature envelope — a SIDECAR, never part of `report.json`. */
export type SignatureEnvelope = {
  readonly signer: Address;
  readonly signature: Hex;
  readonly binding: ReportBinding;
};

/** Sign a report binding offline with a local private key (no wallet/RPC). */
export async function signReport(privateKey: Hex, binding: ReportBinding): Promise<SignatureEnvelope> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: tieoutDomain(binding.chainId),
    types: REPORT_TYPES,
    primaryType: "Report",
    message: binding,
  });
  return { signer: account.address, signature, binding };
}

/**
 * True iff the envelope's signed `binding` covers exactly this report's identity
 * (reportHash + subject + window + engineVersion + chainId). `verify` must check
 * this BEFORE trusting a signature: a signature can be valid over its own
 * binding yet describe a DIFFERENT report, and must not be presented as
 * attesting the report under verification. [Review M2]
 */
export function bindingCovers(binding: ReportBinding, expected: ReportBinding): boolean {
  return (
    binding.reportHash.toLowerCase() === expected.reportHash.toLowerCase() &&
    binding.subject.toLowerCase() === expected.subject.toLowerCase() &&
    binding.startBlock === expected.startBlock &&
    binding.endBlock === expected.endBlock &&
    binding.engineVersion === expected.engineVersion &&
    binding.chainId === expected.chainId
  );
}

export type SignatureCheck =
  | { readonly ok: true; readonly signer: Address }
  | { readonly ok: false; readonly reason: string };

/**
 * Verify a detached signature envelope: enforce low-s (EIP-2) FIRST, then
 * recover to the declared signer EOA. Never throws — a malformed signature is a
 * typed `{ ok: false }`, so `verify` can report it on its own line without
 * blocking hash reproduction.
 */
export async function verifyReportSignature(env: SignatureEnvelope): Promise<SignatureCheck> {
  let s: Hex;
  try {
    ({ s } = parseSignature(env.signature));
  } catch (caught) {
    return { ok: false, reason: `unparseable signature: ${(caught as Error).message}` };
  }
  // EIP-2 low-s: viem PRODUCES low-s, but its recovery is not documented to
  // reject high-s, so enforce it explicitly — exactly one canonical valid form.
  if (BigInt(s) > SECP256K1_HALF_N) {
    return { ok: false, reason: "non-canonical high-s signature (EIP-2 low-s required)" };
  }
  let valid: boolean;
  try {
    valid = await verifyTypedData({
      address: env.signer,
      domain: tieoutDomain(env.binding.chainId),
      types: REPORT_TYPES,
      primaryType: "Report",
      message: env.binding,
      signature: env.signature,
    });
  } catch (caught) {
    return { ok: false, reason: `verification error: ${(caught as Error).message}` };
  }
  if (!valid) return { ok: false, reason: "signature does not recover to the declared signer" };
  return { ok: true, signer: env.signer };
}
