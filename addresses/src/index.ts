/**
 * The single verified address table (AD-5) — the sole source of chain constants
 * for the workspace. Every address is stored **lowercase, `0x`-prefixed,
 * fixed-width** and the table has a deterministic order: by `chainId`, then
 * address. No address is hardcoded inline anywhere else; consumers read here.
 *
 * Addresses are verified — not transcribed from memory — via a `cast` human-side
 * spot-check at seed time and the viem `getAddress` round-trip build guard in
 * `./guard.ts` (AC-1.1.c).
 *
 * The table is not token-only: an entry carries a `kind` discriminator so a
 * non-token address (a Chainlink price feed, AD-18) is representable without
 * mislabelling it a token. Lookups are kind-scoped — `getTokenAddress` resolves
 * only `token` entries, `getFeedAddress` only `priceFeed` entries — so a feed
 * can never be mistaken for a token or vice versa.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-5]
 */

/** What an address entry denotes. Tokens are ERC-20s; feeds are oracle feeds. */
export type AddressKind = "token" | "priceFeed";

/** Known token tickers — kept as a union so token lookups stay typo-safe. */
export type TokenSymbol = "wstETH" | "stETH";

/** Known price-feed labels (base/quote pair) — likewise a union for safety. */
export type FeedSymbol = "stETH/USD";

export type AddressEntry = {
  readonly chainId: number;
  /** Discriminates a token address from a price-feed address. */
  readonly kind: AddressKind;
  /** Free-form label; `kind` disambiguates a token ticker from a feed pair. */
  readonly symbol: string;
  /** Lowercase, `0x`-prefixed, 20-byte hex. */
  readonly address: `0x${string}`;
};

/**
 * Ethereum mainnet (chainId 1) entries. Ordered by `(chainId, address)`:
 * wstETH `0x7f39…` < stETH `0xae7a…` < Chainlink stETH/USD feed `0xcfe5…`.
 * The `kind` field never participates in the ordering (address does).
 */
export const ADDRESS_TABLE: readonly AddressEntry[] = [
  { chainId: 1, kind: "token", symbol: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" },
  { chainId: 1, kind: "token", symbol: "stETH", address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84" },
  { chainId: 1, kind: "priceFeed", symbol: "stETH/USD", address: "0xcfe54b5cd566ab89272946f602d76ea879cab4a8" },
] as const;

/** Look up a **token** address for a chain. Throws if absent (a shell-side
 * effect; the pure `recon` core never resolves addresses — AD-1). */
export function getTokenAddress(chainId: number, symbol: TokenSymbol): `0x${string}` {
  const entry = ADDRESS_TABLE.find(
    (row) => row.chainId === chainId && row.kind === "token" && row.symbol === symbol,
  );
  if (entry === undefined) {
    throw new Error(`no address for ${symbol} on chainId ${chainId}`);
  }
  return entry.address;
}

/** Look up a **price-feed** address for a chain (AD-18). Throws if absent — a
 * shell-side effect, never reached by the pure core (AD-1). */
export function getFeedAddress(chainId: number, symbol: FeedSymbol): `0x${string}` {
  const entry = ADDRESS_TABLE.find(
    (row) => row.chainId === chainId && row.kind === "priceFeed" && row.symbol === symbol,
  );
  if (entry === undefined) {
    throw new Error(`no priceFeed for ${symbol} on chainId ${chainId}`);
  }
  return entry.address;
}
