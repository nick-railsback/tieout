import { type PublicClient, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

/**
 * Shared shell-layer RPC construction for the two mainnet bins (`verify`,
 * `pin-slice`). Previously both hand-copied the byte-identical client + retry
 * comment and the free-tier chunk default, so retuning reliability meant a
 * lockstep edit and drift meant the two fetched under different envelopes
 * (DRY-1) — the same class of duplication `slice.ts` already single-sourced.
 */

/** Free-tier `eth_getLogs` commonly caps the block range near 10; 9 stays under
 * it. Determinism is chunk-INDEPENDENT (see `chunks.ts`), so this only affects
 * fetch cadence, never the manifest hash. */
export const DEFAULT_BLOCKS_PER_CHUNK = 9n;

/** The mainnet public client both RPC bins use. A high `retryCount` lets viem
 * absorb the free-tier 25 req/min limit (429 → backoff); single-sourced so
 * `verify` and `pin-slice` always fetch under the same reliability envelope. */
export function mainnetClient(rpc: string): PublicClient {
  return createPublicClient({ chain: mainnet, transport: http(rpc, { retryCount: 12 }) });
}
