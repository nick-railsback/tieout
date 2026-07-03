import { parseAbi } from "viem";

/**
 * Minimal human-readable ABIs — only the view functions the surface reads. Kept
 * narrow (and typed via `parseAbi`) so viem infers return types. No contract is
 * deployed or written from here; these are read-only.
 */

/** wstETH: the closing balance and the stETH-per-wstETH rate. */
export const WSTETH_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function stEthPerToken() view returns (uint256)",
]);

/** AttestationRegistry (AD-14): the timestamp record keyed by `reportHash`.
 * `getAttestation` returns `(0, 0)` for an un-attested hash (first-write-wins
 * mapping default) — the shell reads that as "not yet anchored". */
export const ATTESTATION_REGISTRY_ABI = parseAbi([
  "function getAttestation(bytes32 reportHash) view returns (uint64 blockNumber, uint64 timestamp)",
  "function isAttested(bytes32 reportHash) view returns (bool)",
]);
