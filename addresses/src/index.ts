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
 * non-token address is representable without mislabelling it a token. Lookups
 * are kind-scoped — `getTokenAddress` resolves only `token` entries,
 * `getFeedAddress` only `priceFeed` entries, `getUtilityAddress` only `utility`
 * entries, `getRegistryAddress` only `registry` entries — so no address of one
 * kind can be mistaken for another.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-5]
 */

/**
 * What an address entry can denote. Tokens are ERC-20s; price feeds are oracle
 * feeds (AD-18); utilities are chain infrastructure (Multicall3, AD-5); a
 * registry is the `AttestationRegistry` anchor (AD-14). Kept as one array so the
 * type below and the build guard's runtime kind check share a single source.
 */
export const ADDRESS_KINDS = ["token", "priceFeed", "utility", "registry"] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

/** Known token tickers — kept as a union so token lookups stay typo-safe. */
export type TokenSymbol = "wstETH" | "stETH";

/** Known price-feed labels (base/quote pair) — likewise a union for safety. */
export type FeedSymbol = "stETH/USD";

/** Known utility labels (chain infrastructure, e.g. Multicall3). */
export type UtilitySymbol = "Multicall3";

/** Known registry labels (the `AttestationRegistry` anchor, AD-14). */
export type RegistrySymbol = "AttestationRegistry";

export type AddressEntry = {
  readonly chainId: number;
  /** Discriminates a token address from a price-feed address. */
  readonly kind: AddressKind;
  /** Free-form label; `kind` disambiguates a token ticker from a feed pair. */
  readonly symbol: string;
  /** Lowercase, `0x`-prefixed, 20-byte hex — the canonical form every consumer
   * reads (AD-5/AD-11). Must equal `checksummed.toLowerCase()`. */
  readonly address: `0x${string}`;
  /**
   * The EIP-55 mixed-case checksum form, transcribed from the trusted source
   * (Etherscan / `cast to-check-sum-address`) — NOT derived from `address`. This
   * is the field that carries EIP-55's error detection: the guard asserts
   * `getAddress(checksummed) === checksummed`, so a single mistyped nibble in a
   * future entry breaks its case-checksum and fails the build. The lowercase
   * `address` alone cannot do this — `getAddress(x).toLowerCase() === x` holds
   * for ANY well-formed lowercase hex, wrong address included (SEC-1).
   */
  readonly checksummed: `0x${string}`;
};

/**
 * The verified entries, ordered by `(chainId, address)` strictly increasing —
 * the `kind` field never participates in the ordering (address does).
 * Ethereum mainnet (chainId 1): wstETH `0x7f39…` < stETH `0xae7a…` <
 * Multicall3 `0xca11…` < Chainlink stETH/USD feed `0xcfe5…`. Local Anvil
 * (31337) sorts after mainnet.
 */
export const ADDRESS_TABLE: readonly AddressEntry[] = [
  // Each `checksummed` is the `cast to-check-sum-address` output for the stored
  // lowercase `address`; the guard cross-checks the two (AD-5, SEC-1).
  {
    chainId: 1,
    kind: "token",
    symbol: "wstETH",
    address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    checksummed: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  },
  {
    chainId: 1,
    kind: "token",
    symbol: "stETH",
    address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
    checksummed: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  },
  // Multicall3 — canonical, identical on every chain. Live wstETH positions are
  // read on mainnet via `multicall` (one aggregate3 round-trip); the address is
  // resolved from here, never inlined in apps/web (AD-5).
  {
    chainId: 1,
    kind: "utility",
    symbol: "Multicall3",
    address: "0xca11bde05977b3631167028862be2a173976ca11",
    checksummed: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  {
    chainId: 1,
    kind: "priceFeed",
    symbol: "stETH/USD",
    address: "0xcfe54b5cd566ab89272946f602d76ea879cab4a8",
    checksummed: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
  },
  // The AttestationRegistry anchor (AD-14). Batch 3's maintainer-gated deploy
  // ladder has run only on local Anvil (31337) to date; Base mainnet (8453) is
  // intentionally ABSENT until its rung runs, so the web degrades gracefully
  // ("not yet anchored") rather than show a fabricated record.
  //
  // Provenance (DRY-4): this address is the deterministic first CREATE from Anvil
  // account 0 at nonce 0 — a toolchain constant, not a project identity. Source
  // of truth: the `.transactions[].contractAddress` in
  // `packages/contracts/broadcast/DeployAttestationRegistry.s.sol/31337/run-latest.json`
  // (gitignored — regenerated by the local deploy). Add each real rung's entry
  // (lowercase + checksummed, guard-checked) at deploy time by transcribing that
  // chain's run-latest.json contractAddress.
  {
    chainId: 31337,
    kind: "registry",
    symbol: "AttestationRegistry",
    address: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    checksummed: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
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

/** Look up a **utility** address (e.g. Multicall3) for a chain (AD-5). Throws if
 * absent — a shell-side effect, never reached by the pure core (AD-1). */
export function getUtilityAddress(chainId: number, symbol: UtilitySymbol): `0x${string}` {
  const entry = ADDRESS_TABLE.find(
    (row) => row.chainId === chainId && row.kind === "utility" && row.symbol === symbol,
  );
  if (entry === undefined) {
    throw new Error(`no utility for ${symbol} on chainId ${chainId}`);
  }
  return entry.address;
}

/** Non-throwing **registry** lookup (AD-14). Surfaces that must degrade
 * gracefully when the anchor is not yet deployed on a chain (e.g. the web on
 * Base mainnet) use this and show "not yet anchored" rather than a fabricated
 * record. Returns `undefined` when absent. */
export function findRegistryAddress(
  chainId: number,
  symbol: RegistrySymbol,
): `0x${string}` | undefined {
  return ADDRESS_TABLE.find(
    (row) => row.chainId === chainId && row.kind === "registry" && row.symbol === symbol,
  )?.address;
}

/** Look up a **registry** address (the `AttestationRegistry` anchor) for a
 * chain (AD-14). Throws if absent; prefer {@link findRegistryAddress} where the
 * caller must tolerate an undeployed anchor. Shell-side effect (AD-1). */
export function getRegistryAddress(chainId: number, symbol: RegistrySymbol): `0x${string}` {
  const address = findRegistryAddress(chainId, symbol);
  if (address === undefined) {
    throw new Error(`no registry for ${symbol} on chainId ${chainId}`);
  }
  return address;
}
