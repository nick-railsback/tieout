import { createConfig } from "ponder";
import { http, type AbiEvent } from "viem";
import {
  DATA_CHAIN_ID,
  LOG_FILTERS,
  SLICE_END_BLOCK,
  SLICE_START_BLOCK,
  TOKEN_REBASED_EVENT,
  TRANSFER_EVENT,
} from "@tieout/recon";
import { requirePonderRpcUrl } from "./src/env.ts";

/**
 * Ponder live adapter (AD-9 Ponder side, Story 2.2). Two log sources — wstETH
 * `Transfer` and Lido/stETH `TokenRebased` — indexed over the pinned Batch 2
 * slice. The fetch universe is the ONE shared `LOG_FILTERS` (filter.ts) the
 * `verify` eth_getLogs adapter also iterates (AC-2.2.c/AD-9): each contract's
 * address is sourced from its `LOG_FILTERS` entry (`filterAddress`, keyed by the
 * shared event object), never re-paired here. The handler assembles the shared
 * `RawLog` and feeds the SAME `derive` — Ponder is NOT on the verify path.
 *
 * Why the `contracts` map stays a literal (keys + ABIs) rather than a
 * `LOG_FILTERS.map(...)`: Ponder's typed `ponder.on("WstETH:Transfer")` registry
 * is codegen'd from this object's INFERRED type, so literal contract keys and
 * `as const` ABIs are load-bearing — `Object.fromEntries` / a widened `AbiEvent`
 * would erase them. The set-level single-sourcing AD-9 needs is enforced instead
 * by a parity test that fails loudly if this universe ever drifts from
 * `LOG_FILTERS` (see test/parity.test.ts) — so a new filter can't silently leave
 * Ponder narrower than verify.
 *
 * Run with `ponder start` (never `ponder dev`, which drops/recreates tables),
 * `DATABASE_SCHEMA` set, `PONDER_TELEMETRY_DISABLED=1`, and `PONDER_RPC_URL_1`.
 */

// The pinned Batch 2 discrepancy slice (Story 2.8) — single-sourced from
// `@tieout/recon` (the same origin `verify`/`pin-slice` use) so the two fetch
// universes cannot cover different windows. Narrowed to `number` for Ponder.
const START_BLOCK = Number(SLICE_START_BLOCK);
const END_BLOCK = Number(SLICE_END_BLOCK);

/** The AD-5 address `LOG_FILTERS` pairs with `event` — sourced from the ONE
 *  shared fetch universe instead of a second address lookup, so each Ponder
 *  contract is bound to its `LOG_FILTERS` entry by the shared event object. */
function filterAddress(event: AbiEvent): `0x${string}` {
  const filter = LOG_FILTERS.find((f) => f.event === event);
  if (filter === undefined) {
    throw new Error(`ponder.config: event ${event.name} is not in LOG_FILTERS (AD-9)`);
  }
  return filter.address;
}

export default createConfig({
  chains: {
    mainnet: { id: DATA_CHAIN_ID, rpc: http(requirePonderRpcUrl()) },
  },
  contracts: {
    WstETH: {
      chain: "mainnet",
      abi: [TRANSFER_EVENT],
      address: filterAddress(TRANSFER_EVENT),
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
    },
    StETH: {
      chain: "mainnet",
      abi: [TOKEN_REBASED_EVENT],
      address: filterAddress(TOKEN_REBASED_EVENT),
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
    },
  },
});
