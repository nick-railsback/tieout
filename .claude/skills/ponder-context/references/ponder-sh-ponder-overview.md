# Ponder — architecture & project overview

Orientation for the `ponder` framework (monorepo `ponder-sh/ponder`, core package version `0.16.6`). Read this first; it maps the whole system and points at the topic references for depth. All citations pin to commit `c8f6935fb65176c01b40cae9056be704c0e5318e`.

## Contents

- What Ponder is
- The data flow
- Run modes: `dev` vs `start`
- Monorepo packages
- `packages/core/src` subsystem map
- A standard Ponder project
- Architecture facts worth knowing
- Where to go next

## What Ponder is

Ponder is an open-source TypeScript framework for EVM data indexing: you point it at contracts/accounts/chains, write TypeScript indexing functions that transform onchain events into your own database schema, and query the result over GraphQL or SQL ([README.md#L8](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/README.md#L8)). It is the developer-facing alternative to hand-rolling a subgraph or a bespoke ETL pipeline — the framework owns RPC fetching, caching, reorg handling, and the query API so your code only owns the transform.

## The data flow

The pipeline is **RPC → sync → indexing functions → store → query API**. The sync layer fetches and caches raw onchain data; the runtime feeds ordered events into your indexing functions; those write to the store; and the server exposes the store over HTTP. The orchestration entry points live in [`packages/core/src/runtime/`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/runtime/index.ts#L41-L51), where `SyncProgress` tracks each chain's start/end/current/finalized block positions.

## Run modes: `dev` vs `start`

`ponder dev` is the local development server: it watches project files and hot-reloads on change via a build queue, runs a terminal UI, and disables crash recovery (tables are dropped and recreated) ([bin/commands/dev.ts#L28-L100](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/dev.ts#L28-L100)). `ponder start` is the production runner: a single build pass, no hot reload, crash recovery enabled ([bin/commands/start.ts#L36-L90](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/start.ts#L36-L90)). See the CLI & production reference for the full command surface.

## Monorepo packages

The repo is a pnpm workspace. The published packages and what they do:

- **`ponder`** — the framework itself; everything below `packages/core/` ([packages/core/package.json#L2-L3](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/package.json#L2-L3)).
- **`@ponder/client`** — TypeScript SDK for querying a Ponder instance over SQL-over-HTTP ([packages/client/package.json#L2-L4](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/client/package.json#L2-L4)).
- **`@ponder/react`** — React hooks (built on `@tanstack/react-query`) wrapping `@ponder/client` ([packages/react/package.json#L2-L4](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/react/package.json#L2-L4)).
- **`@ponder/utils`** — standalone helpers (`rateLimit`, `loadBalance`, `mergeAbis`, `replaceBigInts`); versioned independently ([packages/utils/package.json#L2-L3](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/utils/package.json#L2-L3)).
- **`create-ponder`** — the `bun create ponder` / `npm init ponder` scaffolder ([packages/create-ponder/package.json#L2-L3](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/create-ponder/package.json#L2-L3)).
- **`eslint-config-ponder`** — the recommended ESLint ruleset ([packages/eslint-config-ponder/package.json#L2-L4](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/eslint-config-ponder/package.json#L2-L4)).

The core package declares `hono`, `viem`, and `typescript` as peer dependencies, so a project brings its own copies of those ([packages/core/package.json#L58-L67](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/package.json#L58-L67)).

## `packages/core/src` subsystem map

The public API is re-exported from one barrel ([packages/core/src/index.ts](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts#L1-L140)). Internally the code splits into these subsystems:

- **`config`** — parses/validates `ponder.config.ts` (chains, contracts, accounts, blocks) → see the config reference.
- **`drizzle`** — Ponder's onchain extensions to Drizzle ORM (`onchainTable`, column types) → see the schema reference.
- **`indexing`** + **`indexing-store`** — executes your indexing functions and buffers their writes → see the indexing reference.
- **`sync-historical`**, **`sync-realtime`**, **`sync-store`**, **`rpc`** — the sync engine (backfill, live/reorg, cache, RPC) → see the sync-internals reference.
- **`server`**, **`graphql`**, **`client`** — the HTTP query layer → see the query reference.
- **`database`** — Postgres/PGlite driver, schema management, crash-recovery triggers → see the CLI & production reference.
- **`build`** — Vite-based compilation of config/schema/indexing into a content-hashed build ([build/index.ts#L55-L80](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/index.ts#L55-L80)).
- **`bin`** — the CLI (`dev`, `start`, `serve`, `db`, `codegen`) ([bin/ponder.ts#L24-L58](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/ponder.ts#L24-L58)).
- **`internal`** — cross-cutting: logger, metrics, telemetry, options, errors, shutdown.
- **`runtime`**, **`types`**, **`ui`**, **`utils`** — orchestration, public types, terminal UI, and shared helpers (checkpoint/interval math).

## A standard Ponder project

Every project has three author-owned files. `ponder.config.ts` default-exports `createConfig(...)` ([config/index.ts#L29-L45](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L29-L45)); `ponder.schema.ts` declares tables via `onchainTable(...)` ([drizzle/onchain.ts#L265-L288](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/drizzle/onchain.ts#L265-L288)); and `src/index.ts` registers handlers with `ponder.on(...)` imported from the `ponder:registry` virtual module ([types/virtual.ts#L235-L242](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/types/virtual.ts#L235-L242)). The `examples/` directory has runnable templates for each pattern — the ERC-721 reference project is the smallest complete example ([examples/reference-erc721/ponder.config.ts](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/examples/reference-erc721/ponder.config.ts#L1-L20)). Optional additions include `src/api/index.ts` for custom Hono routes and `abis/` for ABI constants.

Config and schema reach the indexing functions through two Vite virtual modules resolved at build time: `ponder:registry` (the `ponder` handler-registration object) and `ponder:schema` (the compiled tables) ([build/index.ts#L55-L80](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/index.ts#L55-L80)).

## Architecture facts worth knowing

**Two databases, one API.** Ponder runs on Postgres (production) or PGlite (embedded, zero-config local dev); selection is `database.kind` → `DATABASE_URL` present → PGlite fallback ([config/index.ts#L49-L66](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L49-L66)).

**Ordering is a config choice.** `ordering` is `"multichain"` (default; each chain progresses independently, lowest latency), `"omnichain"` (global cross-chain order by timestamp, higher latency), or `"experimental_isolated"` ([config/index.ts#L11](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts#L11)). This choice ripples through the whole sync/indexing path — see the sync-internals reference.

**Reorgs and crashes are handled by the framework, not your code.** Every store write is mirrored into a `ponder_reorg_*` shadow table tagged with an operation and checkpoint; on a reorg or crash the framework rolls back to the common ancestor via a CTE and re-runs ([database/actions.ts#L815-L842](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/database/actions.ts#L815-L842)). The practical consequence for you: indexing functions must be deterministic and idempotent (see the indexing reference).

**Anonymous telemetry is on by default.** It sends a hashed project id, package versions, and machine stats on a 60s heartbeat; disable with `PONDER_TELEMETRY_DISABLED` ([internal/telemetry.ts#L20-L56](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/telemetry.ts#L20-L56)).

## Where to go next

- **Configuring sources** (chains, contracts, factories, accounts, blocks) → `ponder-sh-ponder-config.md`.
- **Declaring your database** (`onchainTable`, columns, relations) → `ponder-sh-ponder-schema.md`.
- **Writing indexing functions** (`ponder.on`, context, the store API) → `ponder-sh-ponder-indexing.md`.
- **Querying indexed data** (GraphQL, SQL-over-HTTP, `@ponder/client`, `@ponder/react`) → `ponder-sh-ponder-query.md`.
- **How sync actually works** (backfill, reorgs, checkpoints, RPC) → `ponder-sh-ponder-sync-internals.md`.
- **Running it** (CLI, deployment, schema management, env vars) → `ponder-sh-ponder-cli-and-production.md`.

_Source files: [`README.md`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/README.md), [`packages/core/src/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/index.ts), [`packages/core/src/config/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/config/index.ts), [`packages/core/src/runtime/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/runtime/index.ts), [`packages/core/src/build/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/index.ts), all at commit `c8f6935`._
