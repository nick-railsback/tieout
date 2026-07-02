import { encodeEventTopics, parseAbiItem, type Hex } from "viem";

/**
 * The two log events the derivation understands, and their `topic0` selectors —
 * defined ONCE here so the shared fetch filter (`filter.ts`) and the shared
 * derivation (`derivation.ts`) agree on identical event definitions. Two
 * producers with subtly different ABIs would decode identically yet split the
 * manifest hash, so this is the single source (AC-2.2.c).
 *
 * Pure: this module resolves no addresses and does no I/O — `filter.ts` pairs
 * these events with the AD-5 addresses; the derivation classifies logs by
 * `topic0` and validates the emitting address against the manifest's embedded
 * table (data-only, AD-1-safe).
 */

/** wstETH `Transfer` — drives the closing-shares axis. */
export const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/** Lido/stETH `TokenRebased` — anchors rate-curve points (AD-6). */
export const TOKEN_REBASED_EVENT = parseAbiItem(
  "event TokenRebased(uint256 indexed reportTimestamp, uint256 timeElapsed, uint256 preTotalShares, uint256 preTotalEther, uint256 postTotalShares, uint256 postTotalEther, uint256 sharesMintedAsFees)",
);

/** `topic0` (event signature hash) for each — the classification key. */
export const TRANSFER_TOPIC0: Hex = encodeEventTopics({
  abi: [TRANSFER_EVENT],
  eventName: "Transfer",
})[0]! as Hex;

export const TOKEN_REBASED_TOPIC0: Hex = encodeEventTopics({
  abi: [TOKEN_REBASED_EVENT],
  eventName: "TokenRebased",
})[0]! as Hex;
