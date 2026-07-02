import { getTokenAddress } from "@tieout/addresses";
import { type AbiEvent, type Hex } from "viem";
import {
  TOKEN_REBASED_EVENT,
  TOKEN_REBASED_TOPIC0,
  TRANSFER_EVENT,
  TRANSFER_TOPIC0,
} from "./events.ts";

/**
 * The ONE shared address+topic fetch filter (AD-9), derived from the AD-5 table.
 * BOTH adapters — the `verify` `eth_getLogs` re-fetch and the Ponder live
 * indexer — iterate these identical definitions to decide what to fetch. Two
 * adapters running the same normalizer over *different* filter universes would
 * still split the manifest hash (AC-2.2.c), so the universe is defined once.
 *
 * This is shell config (it resolves addresses from the AD-5 table) — the pure
 * `derive` never imports it; it classifies by `topic0` and validates the address
 * against the manifest's embedded table (AD-1-safe).
 */
export const DATA_CHAIN_ID = 1;

export type LogFilter = {
  /** Lowercase, `0x`-prefixed token address from the AD-5 table. */
  readonly address: `0x${string}`;
  readonly event: AbiEvent;
  readonly topic0: Hex;
  /** Human label for logging/labels only — never on the canonical path. */
  readonly label: string;
};

export const LOG_FILTERS: readonly LogFilter[] = [
  {
    address: getTokenAddress(DATA_CHAIN_ID, "wstETH"),
    event: TRANSFER_EVENT,
    topic0: TRANSFER_TOPIC0,
    label: "wstETH.Transfer",
  },
  {
    address: getTokenAddress(DATA_CHAIN_ID, "stETH"),
    event: TOKEN_REBASED_EVENT,
    topic0: TOKEN_REBASED_TOPIC0,
    label: "stETH.TokenRebased",
  },
];
