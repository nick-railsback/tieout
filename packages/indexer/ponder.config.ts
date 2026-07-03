import { createConfig } from "ponder";
import { http } from "viem";
import { getTokenAddress } from "@tieout/addresses";
import { SLICE_END_BLOCK, SLICE_START_BLOCK, TOKEN_REBASED_EVENT, TRANSFER_EVENT } from "@tieout/recon";

/**
 * Ponder live adapter (AD-9 Ponder side, Story 2.2). Two log sources — wstETH
 * `Transfer` and Lido/stETH `TokenRebased` — indexed over the pinned Batch 2
 * slice. BOTH the addresses (AD-5 table via `getTokenAddress`) AND the event
 * definitions (`TRANSFER_EVENT`/`TOKEN_REBASED_EVENT` from `@tieout/recon`) are
 * the SAME single source the `verify` eth_getLogs adapter uses (AC-2.2.c/AD-9),
 * so the two fetch universes cannot diverge. The handler assembles the shared
 * `RawLog` and feeds the SAME `derive` — Ponder is NOT on the verify path.
 *
 * Run with `ponder start` (never `ponder dev`, which drops/recreates tables),
 * `DATABASE_SCHEMA` set, `PONDER_TELEMETRY_DISABLED=1`, and `PONDER_RPC_URL_1`.
 */

// The pinned Batch 2 discrepancy slice (Story 2.8) — single-sourced from
// `@tieout/recon` (the same origin `verify`/`pin-slice` use) so the two fetch
// universes cannot cover different windows. Narrowed to `number` for Ponder.
const START_BLOCK = Number(SLICE_START_BLOCK);
const END_BLOCK = Number(SLICE_END_BLOCK);

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: http(process.env.PONDER_RPC_URL_1) },
  },
  contracts: {
    WstETH: {
      chain: "mainnet",
      abi: [TRANSFER_EVENT],
      address: getTokenAddress(1, "wstETH"),
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
    },
    StETH: {
      chain: "mainnet",
      abi: [TOKEN_REBASED_EVENT],
      address: getTokenAddress(1, "stETH"),
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
    },
  },
});
