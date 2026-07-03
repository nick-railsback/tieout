/**
 * Live wstETH positions from Ethereum mainnet — the everyday always-green panel.
 *
 * Reads the subject's balance and the stETH-per-wstETH rate in ONE `aggregate3`
 * round-trip via Multicall3 (`multicall`), and pushes updates on every new block
 * over a WebSocket subscription (`watchBlocks` ⇒ real `eth_subscribe`, not
 * polling). Every address comes from the `@tieout/addresses` table (AD-5); none
 * is inlined here.
 *
 * The reconnect budget is raised above viem's silent default and the
 * terminal/degraded state is surfaced via `onStatus`, so the surface never dies
 * silently with the socket (AC-5.2.c).
 */
import { createPublicClient, webSocket } from "viem";
import { mainnet } from "viem/chains";
import { getTokenAddress, getUtilityAddress } from "@tieout/addresses";
import { WSTETH_ABI } from "./abi.ts";
import { WSS_URL, WS_RECONNECT_ATTEMPTS, WS_RECONNECT_DELAY_MS } from "./config.ts";
import type { LivePositionInput } from "./view.ts";

/** wstETH lives on mainnet (chainId 1) — the data chain. */
const DATA_CHAIN_ID = 1;

export type LiveStatus = "connecting" | "live" | "reconnecting" | "disconnected";

export type LivePositionsHandle = { readonly stop: () => void };

export type LivePositionsOptions = {
  readonly subject: `0x${string}`;
  readonly onUpdate: (position: LivePositionInput) => void;
  readonly onStatus: (status: LiveStatus) => void;
  readonly onError: (error: unknown) => void;
};

/**
 * Start streaming the subject's live wstETH position. Returns a handle whose
 * `stop()` tears down the block subscription.
 */
export function startLivePositions(options: LivePositionsOptions): LivePositionsHandle {
  const client = createPublicClient({
    chain: mainnet,
    transport: webSocket(WSS_URL, {
      reconnect: { attempts: WS_RECONNECT_ATTEMPTS, delay: WS_RECONNECT_DELAY_MS },
    }),
  });

  const wstEth = getTokenAddress(DATA_CHAIN_ID, "wstETH");
  const multicall3 = getUtilityAddress(DATA_CHAIN_ID, "Multicall3");

  // Track consecutive socket errors so an EXHAUSTED reconnect budget renders as
  // a real terminal "disconnected" state — not "reconnecting…" forever
  // (AC-5.2.c). A successful read resets the counter.
  let consecutiveErrors = 0;

  async function refetch(): Promise<void> {
    // One aggregate3 round-trip; `allowFailure: false` throws on any sub-call
    // failure so the shell surfaces it rather than render a partial position.
    const [balanceWstEth, stEthPerToken] = await client.multicall({
      multicallAddress: multicall3,
      allowFailure: false,
      contracts: [
        { address: wstEth, abi: WSTETH_ABI, functionName: "balanceOf", args: [options.subject] },
        { address: wstEth, abi: WSTETH_ABI, functionName: "stEthPerToken" },
      ],
    });
    consecutiveErrors = 0;
    options.onUpdate({ subject: options.subject, balanceWstEth, stEthPerToken });
    options.onStatus("live");
  }

  options.onStatus("connecting");
  void refetch().catch(options.onError);

  // Push updates on each new head over the WebSocket. `onError` fires when the
  // subscription (or an exhausted reconnect) fails — we surface it, never swallow.
  // Once errors reach the reconnect budget, the socket is treated as dead and the
  // status goes terminal ("disconnected") rather than looping on "reconnecting".
  const unwatch = client.watchBlocks({
    emitOnBegin: false,
    onBlock: () => {
      void refetch().catch(options.onError);
    },
    onError: (error) => {
      consecutiveErrors += 1;
      options.onStatus(consecutiveErrors >= WS_RECONNECT_ATTEMPTS ? "disconnected" : "reconnecting");
      options.onError(error);
    },
  });

  return { stop: () => unwatch() };
}
