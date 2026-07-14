# Ponder — indexing functions (`ponder.on`, context, the store)

Indexing functions are the code you write in `src/` to turn onchain events into rows. You register them with `ponder.on(...)` and each receives an `event` and a `context`. Citations pin to commit `c8f6935fb65176c01b40cae9056be704c0e5318e`.

## Contents

- Registering handlers
- The `context` argument
- The store API (`context.db`)
- The `event` object
- Setup events
- Ordering & reorg safety
- Determinism rules & gotchas

## Registering handlers

`ponder.on(name, fn)` registers an async handler for an event; `ponder` is imported from the `ponder:registry` virtual module ([types/virtual.ts#L235-L242](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/virtual.ts#L235-L242)). Event names follow fixed patterns: `{Contract}:{Event}` for logs, `{Contract}:setup` for setup, `{Source}:block` for block intervals, `{Account}:transaction:from|to` and `{Account}:transfer:from|to` for accounts, and `{Contract}.{Function}()` for call traces (requires `includeCallTraces`) ([types/virtual.ts#L37-L59](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/virtual.ts#L37-L59)). Names are fully typed from your config, so a typo is a compile error.

## The `context` argument

Every handler gets `context` with four members: `context.chain` (`{ id, name }`), `context.client` (a read-only viem client), `context.db` (the store), and `context.contracts` (each configured contract's abi/address/block range for the current chain) ([indexing/index.ts#L71-L84](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/index.ts#L71-L84)). `context.client` is a `ReadonlyClient` exposing the read half of viem — `readContract`, `multicall`, `getBalance`, `getStorageAt`, `getBlock`, and more ([indexing/client.ts#L274-L293](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/client.ts#L274-L293)). Its calls default to the current `event.block.number` and cache their results in the database, so re-runs during a reorg return identical values ([indexing/client.ts#L88-L150](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/client.ts#L88-L150)).

## The store API (`context.db`)

The store is a typed CRUD API over your `onchainTable`s ([types/db.ts#L32-L126](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L32-L126)). The four operations:

- `db.find(table, key)` → the row or `null` ([types/db.ts#L166-L171](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L166-L171)).
- `db.insert(table).values(row | rows)`, optionally chained with `.onConflictDoNothing()` or `.onConflictDoUpdate(values | (row) => values)` for upserts ([types/db.ts#L173-L247](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L173-L247)).
- `db.update(table, key).set(values | (row) => values)` — throws if the row is missing; you cannot update primary-key columns ([types/db.ts#L249-L285](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L249-L285)).
- `db.delete(table, key)` → `true`/`false` ([types/db.ts#L287-L292](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L287-L292)).

Writes are buffered in memory and flushed to the database with bulk `COPY`, which is why the store is dramatically faster than raw SQL ([indexing-store/index.ts#L159-L621](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing-store/index.ts#L159-L621)). For queries the store can't express there's `db.sql`, a full Drizzle query builder against the same tables — correct but 100–1000× slower than the store methods, so reserve it for reads that need joins or aggregates ([types/db.ts#L125](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L125)).

## The `event` object

`event` is a discriminated union across log/block/transaction/trace/transfer/setup ([internal/types.ts#L507-L596](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/types.ts#L507-L596)). For a log event you get `event.args` (ABI-decoded), `event.log`, `event.block`, `event.transaction`, and — when enabled — `event.transactionReceipt`. The block/transaction/receipt/trace shapes are defined in [types/eth.ts#L9-L216](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/eth.ts#L9-L216); `event.trace` carries the call frame for trace/transfer events and `event.transfer` carries `{ from, to, value }` for account transfers. Every event also has a stable `event.id` you can use as a primary key.

Event fields are lazily fetched: Ponder wraps `block`/`transaction`/`trace`/`receipt` in a Proxy that records which properties you actually read, then only fetches those over RPC ([indexing/index.ts#L395-L419](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/index.ts#L395-L419)). Reading a field that isn't available for that event type throws `InvalidEventAccessError`.

## Setup events

`ponder.on("{Contract}:setup", fn)` runs once per chain before any historical events, with the same `context` available ([internal/types.ts#L514-L521](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/types.ts#L514-L521)). Use it to seed lookup tables or compute initial state; the executor lives at [indexing/index.ts#L199-L265](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/index.ts#L199-L265).

## Ordering & reorg safety

Within a chain, events arrive in strict EVM execution order — block number, then transaction index, then log index ([docs/pages/docs/indexing/overview.mdx#L33-L35](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/indexing/overview.mdx#L33-L35)). Reorg recovery is fully automatic: on detection Ponder evicts the non-canonical RPC cache, rolls back store writes to the common ancestor via its transaction log, and re-runs the affected handlers on canonical data — your code needs no reorg logic ([docs/pages/docs/indexing/overview.mdx#L37-L47](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/indexing/overview.mdx#L37-L47)). The re-run is what makes idempotence a hard requirement (below). Cross-chain ordering depends on your `ordering` config — see the config and sync-internals references.

## Determinism rules & gotchas

Because handlers re-execute on reorgs, they must be **deterministic and idempotent**: no `Date.now()`, no `Math.random()`, and no ad-hoc network calls — do all onchain reads through `context.client` so they're pinned to the event's block and cached ([indexing/client.ts#L88-L150](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/client.ts#L88-L150)). Always `await` store calls inside the handler body — an unawaited store promise that resolves after the function returns throws "A store API method was called after the indexing function returned" ([indexing-store/index.ts#L120-L152](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing-store/index.ts#L120-L152)). `db.update` on a missing key throws `RecordNotFoundError`; use `db.insert(...).onConflictDoUpdate(...)` when a row may or may not exist yet ([indexing-store/index.ts#L496-L503](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing-store/index.ts#L496-L503)). Transient database errors are retried automatically; non-retryable errors halt indexing with a framed error ([indexing/index.ts#L315-L340](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/index.ts#L315-L340)).

_Source files: [`packages/core/src/types/virtual.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/virtual.ts), [`packages/core/src/indexing/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/index.ts), [`packages/core/src/indexing/client.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing/client.ts), [`packages/core/src/indexing-store/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/indexing-store/index.ts), [`packages/core/src/types/db.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts), [`packages/core/src/types/eth.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/eth.ts), [`packages/core/src/internal/types.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/types.ts), all at commit `c8f6935`._
