# Ponder — `ponder.config.ts` (chains, contracts, accounts, blocks)

The config file default-exports the object returned by `createConfig(...)` and declares what Ponder indexes. Citations pin to commit `c8f6935fb65176c01b40cae9056be704c0e5318e`; the config type surface lives almost entirely in [`packages/core/src/config/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts).

## Contents

- `createConfig` shape
- `database`
- `chains` and transports
- `contracts`
- Factories (dynamic addresses)
- `accounts`
- `blocks`
- Ordering
- Defaults & gotchas

## `createConfig` shape

`createConfig` is a generic identity function that infers `chains`/`contracts`/`accounts`/`blocks` and returns the config typed for downstream inference — it does no runtime work beyond a cast ([config/index.ts#L29-L45](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L29-L45)). The top-level `Config` type has `database?`, `ordering?`, required `chains`, and optional `contracts`/`accounts`/`blocks` maps keyed by your own names ([config/index.ts#L9-L18](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L9-L18)). The file must `export default createConfig(...)`; the CLI resolves `ponder.config.ts` by default and `--config` overrides the path ([bin/ponder.ts#L24-L58](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/ponder.ts#L24-L58)).

## `database`

`database` is a discriminated union on `kind`. `kind: "pglite"` takes an optional `directory` (default `.ponder/pglite`); `kind: "postgres"` takes `connectionString` (defaults to `DATABASE_PRIVATE_URL` then `DATABASE_URL`) and a `poolConfig` passed to `node-postgres`, whose `max` defaults to `30` and `ssl` defaults to `undefined` ([config/index.ts#L49-L66](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L49-L66)). If `database` is omitted, Ponder uses Postgres when `DATABASE_URL` is set and PGlite otherwise — so a bare local project "just works" on PGlite, and setting `DATABASE_URL` in production silently switches to Postgres.

## `chains` and transports

Each entry in `chains` is a `ChainConfig`: required `id` (the numeric chain id) and `rpc`, plus optional `ws`, `pollingInterval`, `disableCache`, and `ethGetLogsBlockRange` ([config/index.ts#L92-L112](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L92-L112)). `rpc` accepts a single URL string, an array of URLs, or a viem `Transport` — so you can hand it `http()`, `fallback()`, `loadBalance()`, or a rate-limited transport directly.

`maxRequestsPerSecond` is deprecated; rate limiting is now handled automatically by the adaptive RPC layer ([config/index.ts#L101-L106](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L101-L106)). When you do need explicit control, `@ponder/utils` exports a `rateLimit(transport, { requestsPerSecond, browser? })` wrapper and a `loadBalance` transport ([packages/utils/src/rateLimit.ts#L7-L43](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/utils/src/rateLimit.ts#L7-L43)). Note that raising `pollingInterval` above block time does not cut RPC usage — Ponder still fetches every block for reorg detection.

## `contracts`

A `ContractConfig` composes an ABI, a chain binding, an address, an optional event filter, and the receipt/trace/block-range options ([config/index.ts#L152-L160](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L152-L160)). Supply `abi` as an `as const` array so event names and args are fully typed ([config/index.ts#L122-L125](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L122-L125)). The block-range and inclusion options come from shared base types: `startBlock`/`endBlock` accept a number or `"latest"` (a missing `endBlock` means index in realtime forever) ([config/index.ts#L69-L74](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L69-L74)); `includeTransactionReceipts` ([config/index.ts#L76-L78](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L76-L78)) and `includeCallTraces` ([config/index.ts#L80-L88](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L80-L88)) are both off by default.

`chain` may be a string (bind to one chain) or an object mapping chain names to per-chain overrides for a multichain contract — every field except `abi` can be overridden per chain ([config/index.ts#L127-L149](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L127-L149)). The `filter` field narrows by indexed event args (`{ event, args }`, or an array of such) and only indexed parameters (topics) are filterable ([config/eventFilter.ts#L15-L33](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/eventFilter.ts#L15-L33)).

## Factories (dynamic addresses)

For contracts deployed by a factory, set `address` to a `factory(...)` descriptor instead of a literal address ([config/address.ts#L41-L46](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/address.ts#L41-L46)). The `Factory` shape names the factory `address`, the creation `event` (an `AbiEvent`), and how to locate the child address — either by `parameter` name (preferred) or by low-level `location` (`topic1|2|3` or `offset{n}`) ([config/address.ts#L15-L39](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/address.ts#L15-L39)). Ponder discovers child addresses during sync by scanning for that event; children created after a completed sync aren't picked up until the next run (see the sync-internals reference).

## `accounts`

`accounts` index an EOA or contract address's native activity rather than log events. Each `AccountConfig` binds a `chain`, an `address` (literal or `factory()`), and a block range ([config/index.ts#L199-L204](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L199-L204)). They emit four event kinds — `{name}:transaction:from`, `{name}:transaction:to`, `{name}:transfer:from`, `{name}:transfer:to`. Because the underlying RPC methods (`eth_getBlockByNumber`, `debug_traceBlockByNumber`) can't filter server-side, large account backfills fetch whole blocks and can be expensive.

## `blocks`

`blocks` schedule an indexing function to run on a fixed cadence. A `BlockFilterConfig` has a `chain`, an `interval` (run every N blocks, default `0`), and a start/end block ([config/index.ts#L214-L220](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L214-L220)). With `startBlock: 1000, interval: 10` the handler fires at 1000, 1010, 1020, and so on — useful for periodic snapshots (e.g. reading a price oracle).

## Ordering

`ordering` selects how events from multiple chains interleave: `"multichain"` (default) processes each chain independently for lowest latency; `"omnichain"` produces a single deterministic order across chains by (timestamp, chain id, block number) at the cost of latency; `"experimental_isolated"` runs handlers in isolation and requires `chainId` in every table's primary key ([config/index.ts#L9-L18](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L9-L18)). The choice interacts with your schema and with checkpoint ordering — see `ponder-sh-ponder-sync-internals.md`.

## Defaults & gotchas

- `startBlock` defaults to `0`; `endBlock` defaults to `undefined` = realtime indexing ([config/index.ts#L69-L74](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L69-L74)).
- `pollingInterval` defaults to `1_000` ms; a larger value still fetches every block for reorg checks ([config/index.ts#L99](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L99)).
- `disableCache` defaults to `false`; set it for Anvil/local nodes where cached RPC data would be stale ([config/index.ts#L106](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L106)).
- `ethGetLogsBlockRange` is auto-detected from provider error messages when unset; pin it if your provider's errors are opaque ([config/index.ts#L107-L111](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L107-L111)).
- Postgres pool `max` defaults to `30`; PGlite `directory` defaults to `.ponder/pglite` ([config/index.ts#L49-L66](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L49-L66)).

_Source files: [`packages/core/src/config/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts), [`packages/core/src/config/eventFilter.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/eventFilter.ts), [`packages/core/src/config/address.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/address.ts), [`packages/utils/src/rateLimit.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/utils/src/rateLimit.ts), all at commit `c8f6935`._
