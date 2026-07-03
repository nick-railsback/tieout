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
import {
  LIVE_READ_FAILURE_LIMIT,
  WSS_URL,
  WS_RECONNECT_ATTEMPTS,
  WS_RECONNECT_DELAY_MS,
} from "./config.ts";
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
 * The two chain effects the live surface needs, behind a seam. The default
 * implementation is the real viem WebSocket client; a test injects fakes to
 * drive the read/socket failure paths headless (the surface is otherwise an
 * untestable shell). `read` does one `aggregate3` round-trip; `watch` subscribes
 * to new heads and returns an unsubscribe.
 */
export type LivePositionsDeps = {
  readonly read: () => Promise<{ balanceWstEth: bigint; stEthPerToken: bigint }>;
  readonly watch: (handlers: {
    readonly onBlock: () => void;
    readonly onError: (error: unknown) => void;
  }) => () => void;
};

/** The production deps: a real `eth_subscribe` WebSocket client (AD-5 addresses). */
function defaultDeps(subject: `0x${string}`): LivePositionsDeps {
  const client = createPublicClient({
    chain: mainnet,
    transport: webSocket(WSS_URL, {
      reconnect: { attempts: WS_RECONNECT_ATTEMPTS, delay: WS_RECONNECT_DELAY_MS },
    }),
  });
  const wstEth = getTokenAddress(DATA_CHAIN_ID, "wstETH");
  const multicall3 = getUtilityAddress(DATA_CHAIN_ID, "Multicall3");
  return {
    read: async () => {
      // One aggregate3 round-trip; `allowFailure: false` throws on any sub-call
      // failure so the shell surfaces it rather than render a partial position.
      const [balanceWstEth, stEthPerToken] = await client.multicall({
        multicallAddress: multicall3,
        allowFailure: false,
        contracts: [
          { address: wstEth, abi: WSTETH_ABI, functionName: "balanceOf", args: [subject] },
          { address: wstEth, abi: WSTETH_ABI, functionName: "stEthPerToken" },
        ],
      });
      return { balanceWstEth, stEthPerToken };
    },
    watch: (handlers) =>
      client.watchBlocks({ emitOnBegin: false, onBlock: handlers.onBlock, onError: handlers.onError }),
  };
}

/**
 * Start streaming the subject's live wstETH position. Returns a handle whose
 * `stop()` tears down the block subscription.
 */
export function startLivePositions(
  options: LivePositionsOptions,
  deps: LivePositionsDeps = defaultDeps(options.subject),
): LivePositionsHandle {
  // Two failure signals, both surfaced as terminal state so the panel never dies
  // silently (AC-5.2.c). A successful read proves the whole path is healthy and
  // resets both. The READ path escalates faster than the socket reconnect budget:
  // a healthy socket whose eth_calls keep failing must NOT pin "connecting…"
  // forever with errors visible only in the console.
  let consecutiveReadErrors = 0;
  let consecutiveSocketErrors = 0;

  async function refetch(): Promise<void> {
    const { balanceWstEth, stEthPerToken } = await deps.read();
    consecutiveReadErrors = 0;
    consecutiveSocketErrors = 0;
    options.onUpdate({ subject: options.subject, balanceWstEth, stEthPerToken });
    options.onStatus("live");
  }

  function onReadError(error: unknown): void {
    consecutiveReadErrors += 1;
    options.onStatus(
      consecutiveReadErrors >= LIVE_READ_FAILURE_LIMIT ? "disconnected" : "reconnecting",
    );
    options.onError(error);
  }

  options.onStatus("connecting");
  void refetch().catch(onReadError);

  // Push updates on each new head. `onError` fires when the subscription (or an
  // exhausted reconnect) fails; once errors reach the reconnect budget the socket
  // is treated as dead and the status goes terminal rather than looping forever.
  const unwatch = deps.watch({
    onBlock: () => {
      void refetch().catch(onReadError);
    },
    onError: (error) => {
      consecutiveSocketErrors += 1;
      options.onStatus(
        consecutiveSocketErrors >= WS_RECONNECT_ATTEMPTS ? "disconnected" : "reconnecting",
      );
      options.onError(error);
    },
  });

  return { stop: () => unwatch() };
}
