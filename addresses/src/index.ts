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
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-5]
 */

export type TokenSymbol = "wstETH" | "stETH";

export type AddressEntry = {
  readonly chainId: number;
  readonly symbol: TokenSymbol;
  /** Lowercase, `0x`-prefixed, 20-byte hex. */
  readonly address: `0x${string}`;
};

/**
 * Ethereum mainnet (chainId 1) Lido tokens. Ordered by `(chainId, address)`:
 * wstETH `0x7f39…` sorts before stETH `0xae7a…`.
 */
export const ADDRESS_TABLE: readonly AddressEntry[] = [
  { chainId: 1, symbol: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" },
  { chainId: 1, symbol: "stETH", address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84" },
] as const;

/** Look up a token address for a chain. Throws if absent (a shell-side effect;
 * the pure `recon` core never resolves addresses — AD-1). */
export function getTokenAddress(chainId: number, symbol: TokenSymbol): `0x${string}` {
  const entry = ADDRESS_TABLE.find((row) => row.chainId === chainId && row.symbol === symbol);
  if (entry === undefined) {
    throw new Error(`no address for ${symbol} on chainId ${chainId}`);
  }
  return entry.address;
}
