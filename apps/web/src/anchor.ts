/**
 * The Base attestation anchor (AD-14). Reads the AttestationRegistry record for
 * a report hash via `readContract`, and degrades gracefully when the registry is
 * undeployed or the hash is un-attested — it shows "not yet anchored", never a
 * fabricated record. The registry address comes from the `@tieout/addresses`
 * table (AD-5); if the target chain has no entry, no RPC call is even made.
 */
import { createPublicClient, http, type Hex } from "viem";
import { anvil, base, baseSepolia, mainnet } from "viem/chains";
import { findRegistryAddress } from "@tieout/addresses";
import { ATTESTATION_REGISTRY_ABI } from "./abi.ts";
import type { AnchorState } from "./view.ts";

/** Resolve a viem chain for the anchor chainId (undefined when unknown — viem
 * can still read with an explicit RPC url and no chain metadata). */
function chainFor(chainId: number) {
  switch (chainId) {
    case base.id:
      return base;
    case baseSepolia.id:
      return baseSepolia;
    case anvil.id:
      return anvil;
    case mainnet.id:
      return mainnet;
    default:
      return undefined;
  }
}

export type ReadAnchorOptions = {
  readonly chainId: number;
  readonly reportHash: Hex;
  readonly rpcUrl?: string | undefined;
};

/** Read the anchor record for `reportHash`. Never throws — every failure mode
 * (undeployed registry, un-attested hash, RPC error) is returned as a typed
 * {@link AnchorState} the view renders honestly. */
export async function readAnchor(options: ReadAnchorOptions): Promise<AnchorState> {
  const registry = findRegistryAddress(options.chainId, "AttestationRegistry");
  if (registry === undefined) {
    // No deploy recorded for this chain (e.g. Base mainnet today) → honest default.
    return { kind: "not-deployed", chainId: options.chainId };
  }

  try {
    const chain = chainFor(options.chainId);
    const client = createPublicClient({
      ...(chain ? { chain } : {}),
      transport: http(options.rpcUrl),
    });
    const [blockNumber, timestamp] = await client.readContract({
      address: registry,
      abi: ATTESTATION_REGISTRY_ABI,
      functionName: "getAttestation",
      args: [options.reportHash],
    });

    if (blockNumber === 0n && timestamp === 0n) {
      return { kind: "not-anchored", chainId: options.chainId, reportHash: options.reportHash };
    }
    return {
      kind: "anchored",
      chainId: options.chainId,
      reportHash: options.reportHash,
      blockNumber,
      timestamp,
    };
  } catch (error) {
    return {
      kind: "error",
      chainId: options.chainId,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
