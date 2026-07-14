# Ponder — `ponder.schema.ts` (tables, columns, relations)

Ponder's schema layer extends Drizzle ORM with onchain-aware table and column builders. You declare tables with `onchainTable(...)`; the same definitions drive the store API, the GraphQL schema, and the SQL query layer. Citations pin to commit `c8f6935fb65176c01b40cae9056be704c0e5318e`; the builders live in [`packages/core/src/drizzle/`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts) and validation in [`packages/core/src/build/schema.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts).

## Contents

- `onchainTable`
- Column types
- Column modifiers
- Primary keys
- Relations
- Enums
- Validation rules & gotchas

## `onchainTable`

`onchainTable(name, columns, extraConfig?)` declares a table: `name` is the SQL table name (snake_case, max 45 chars), `columns` is a callback receiving the column builders, and `extraConfig` optionally adds composite keys/indexes ([drizzle/onchain.ts#L265-L288](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts#L265-L288)). It is re-exported from the package barrel alongside `onchainEnum` and `relations` ([index.ts#L31-L38](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts#L31-L38)). The 45-character ceiling exists because deployment schemas and reorg-shadow tables append suffixes to your names ([drizzle/onchain.ts#L43](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts#L43)).

## Column types

Ponder ships EVM-native column types on top of Drizzle's standard set. The onchain-specific builders are `hex()` (text-backed `0x${string}`) ([drizzle/hex.ts#L45-L58](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/hex.ts#L45-L58)), `bigint()` (stored as `numeric(78,0)` to hold a full uint256, serialized to JS `bigint`) ([drizzle/bigint.ts#L45-L57](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/bigint.ts#L45-L57)), `bytes()` (`bytea` ↔ `Uint8Array`) ([drizzle/bytes.ts#L52-L68](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/bytes.ts#L52-L68)), and `json()`/`jsonb()` ([drizzle/json.ts#L44-L84](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/json.ts#L44-L84)). These are wired into the builder object at [drizzle/onchain.ts#L100-L157](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts#L100-L157).

Standard Drizzle/Postgres types (`text`, `integer`, `boolean`, `real`, `doublePrecision`, `numeric`, `timestamp`, `uuid`, `varchar`, and more) are re-exported from the barrel ([index.ts#L105-L139](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts#L105-L139)). Note that Ponder's `bigint` shadows Drizzle's — the exported `bigint` is Ponder's uint256-capable numeric type, not Drizzle's 8-byte int ([index.ts#L106](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts#L106)).

## Column modifiers

Columns chain the usual Drizzle modifiers: `.primaryKey()`, `.notNull()`, `.default(value)`, `.$default(() => value)`, `.array()`, and `.$type<T>()`. The one onchain-specific restriction: `.array()` throws on `bytes()` columns ([drizzle/bytes.ts#L45-L50](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/bytes.ts#L45-L50)).

## Primary keys

Every table must declare exactly one primary key, and it's enforced at build time ([build/schema.ts#L199-L206](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts#L199-L206)). A single-column key uses the `.primaryKey()` modifier; a composite key uses the `primaryKey({ columns: [...] })` builder inside `extraConfig` ([drizzle/onchain.ts#L164-L176](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts#L164-L176)). Only `onchainTable`-defined tables are writable through the store API — views and offchain tables are read-only ([types/db.ts#L167-L183](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts#L167-L183)).

## Relations

`relations(...)` (re-exported from Drizzle) declares `one()` / `many()` relationships used by the GraphQL API and the Drizzle query API ([index.ts#L102](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts#L102)). Crucially, relations are a query-layer convenience only — they do **not** create Postgres foreign-key constraints ([docs/pages/docs/schema/relations.mdx#L5-L7](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/schema/relations.mdx#L5-L7)). GraphQL exposes `one()` as a singular nested field and `many()` as a plural/connection field ([docs/pages/docs/schema/relations.mdx#L181](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/schema/relations.mdx#L181)).

## Enums

`onchainEnum(name, values)` creates a Postgres enum type usable as a column ([drizzle/onchain.ts#L345-L357](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts#L345-L357)), and is exported from the barrel ([index.ts#L34](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts#L34)). Enum columns accept the usual modifiers (`.notNull()`, `.default()`, `.array()`).

## Validation rules & gotchas

Schema build rejects a wide set of Postgres features that would break deterministic reorg handling — serial columns, unique constraints, generated columns, foreign keys, check constraints, and raw SQL defaults all throw at build ([build/schema.ts#L79-L124](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts#L79-L124)). Table names `_ponder_meta` and `_ponder_checkpoint` are reserved ([build/schema.ts#L51-L56](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts#L51-L56)), and column names `operation_id`, `operation`, and `checkpoint` are reserved for the reorg-shadow machinery ([build/schema.ts#L135-L142](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts#L135-L142)).

Two data-shape gotchas: `text` columns silently strip null bytes (with a warning) because Postgres `text` can't store them ([drizzle/text.ts#L61-L76](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/text.ts#L61-L76)), and `json`/`jsonb` columns can't hold raw `BigInt` values — run them through `@ponder/utils`' `replaceBigInts()` before insert ([drizzle/json.ts#L54-L72](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/json.ts#L54-L72)). If you use `ordering: "experimental_isolated"`, every table additionally needs a `chainId` column that is part of its primary key ([build/schema.ts#L153-L176](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts#L153-L176)).

_Source files: [`packages/core/src/drizzle/onchain.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts), [`packages/core/src/drizzle/{hex,bigint,bytes,json,text}.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/hex.ts), [`packages/core/src/build/schema.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/schema.ts), [`packages/core/src/types/db.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/db.ts), all at commit `c8f6935`._
