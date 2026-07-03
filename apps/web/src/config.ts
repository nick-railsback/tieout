/**
 * Surface configuration. Everything the shell reads from the environment lands
 * here with a safe default, so the app runs out of the box yet the maintainer
 * can repoint it without a code change.
 */

/** Mainnet WebSocket RPC for live wstETH positions. A real `eth_subscribe`
 * transport (not polling); overridable via `VITE_WSS_URL`. */
export const WSS_URL = import.meta.env.VITE_WSS_URL ?? "wss://ethereum-rpc.publicnode.com";

/**
 * viem's `webSocket` reconnect budget defaults to `attempts: 5, delay: 2000`
 * — a long-lived dashboard that took the default would silently stop updating
 * after ~5 failed reconnects [viem@2.54.1 webSocket.ts#L59-L82]. We raise the
 * attempts AND surface the terminal-disconnect state in the UI (AC-5.2.c), so
 * the surface never dies silently with the socket.
 */
export const WS_RECONNECT_ATTEMPTS = 20;
export const WS_RECONNECT_DELAY_MS = 2_000;

/** Chain the AttestationRegistry anchor is read on. Default Base mainnet (8453);
 * its registry is not deployed yet, so the anchor panel degrades gracefully to
 * "not yet anchored" until the maintainer sets `VITE_ANCHOR_CHAIN_ID` (e.g.
 * 84532 Base Sepolia, or 31337 for a local Anvil demo). A malformed value (a
 * typo like `base`, or an empty string) falls back to 8453 rather than silently
 * rendering "chain NaN"/"chain 0" as a legitimate state. */
const ANCHOR_CHAIN_ID_DEFAULT = 8453;
function resolveAnchorChainId(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ANCHOR_CHAIN_ID_DEFAULT;
}
export const ANCHOR_CHAIN_ID = resolveAnchorChainId(import.meta.env.VITE_ANCHOR_CHAIN_ID);

/** Optional RPC override for the anchor chain (else viem's chain default). */
export const ANCHOR_RPC_URL = import.meta.env.VITE_ANCHOR_RPC_URL;

/** The two committed reports the surface renders (real engine output). BOTH
 * carry the injected reward discrepancy by design (the explain-itself demo), so
 * their labels name that honestly rather than implying an "all-green" report —
 * the everyday always-green signal is the live position + the closing-shares
 * tie-out, not a hand-built reconciled report. Each ships its real `reportHash`
 * as data so the web never re-hashes (AD-13). */
export const REPORTS = {
  golden: { label: "Golden — reward break", json: "/report.golden.json", hash: "/report.golden.hash.txt" },
  slice: { label: "Slice — injected discrepancy", json: "/report.slice.json", hash: "/report.slice.hash.txt" },
} as const;

export type ReportKey = keyof typeof REPORTS;
