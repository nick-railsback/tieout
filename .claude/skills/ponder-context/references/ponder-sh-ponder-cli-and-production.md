# Ponder — CLI & production operations

The `ponder` CLI, database/schema management, deployment, and environment variables. Citations pin to commit `c8f6935fb65176c01b40cae9056be704c0e5318e`. The CLI is defined in [`packages/core/src/bin/`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/ponder.ts).

## Contents

- Scaffolding a project
- CLI commands
- Database schemas & deployments
- Zero-downtime deploys (views)
- Health checks & serving
- Environment variables
- Telemetry & logging

## Scaffolding a project

`create-ponder` scaffolds a new project: it validates the name, copies a template, rewrites `package.json`, optionally installs deps and inits git ([packages/create-ponder/src/index.ts#L138-L430](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/create-ponder/src/index.ts#L138-L430)). Templates cover `empty`, the `feature-*` set (factory, accounts, filter, blocks, call-traces, multichain, proxy, read-contract, api-functions), `reference-erc20/721/1155/4626`, and full `project-*` examples ([packages/create-ponder/src/index.ts#L59-L136](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/create-ponder/src/index.ts#L59-L136)). Choose a template with `-t/--template`, control install with `--skip-install`/`--skip-git`, and the package manager is auto-detected.

## CLI commands

The root command defines global options shared by every subcommand: `--root`, `--config` (default `ponder.config.ts`), `-v/--debug`, `-vv/--trace`, `--log-level`, and `--log-format` ([bin/ponder.ts#L24-L58](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/ponder.ts#L24-L58)). The subcommands:

- **`dev`** — hot-reloading local server with terminal UI; crash recovery off. Flags include `--schema`, `-p/--port` (default 42069), `-H/--hostname`, `--disable-ui` ([bin/commands/dev.ts#L28-L100](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/dev.ts#L28-L100)).
- **`start`** — production runner; single build pass, crash recovery on, supports the views pattern via `--views-schema` ([bin/commands/start.ts#L36-L90](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/start.ts#L36-L90)).
- **`serve`** — HTTP server only, no indexing; Postgres-only, for horizontally scaling the API behind one indexer ([bin/commands/serve.ts#L13-L90](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/serve.ts#L13-L90)).
- **`codegen`** — writes `ponder-env.d.ts` type definitions ([bin/commands/codegen.ts#L10-L56](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/codegen.ts#L10-L56)).
- **`db list` / `db prune` / `db create-views`** — inspect deployments, drop inactive deployment tables/schemas, and create the views that front a deployment ([bin/ponder.ts#L129-L189](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/ponder.ts#L129-L189)).

## Database schemas & deployments

Each running instance owns a Postgres schema and writes bookkeeping tables into it: `_ponder_meta` (build id, table names, lock, heartbeat, readiness) and `_ponder_checkpoint` (per-chain progress) ([database/index.ts#L94-L141](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/database/index.ts#L94-L141)). Two instances cannot share a schema at once — the lock in `_ponder_meta` enforces it. Crash recovery keys off the `build_id` (a content hash of config + schema + indexing code): a restarted `ponder start` with the same schema and build id resumes from the last checkpoint instead of re-indexing, replaying the reorg-shadow tables to restore a clean state ([bin/commands/start.ts#L228-L234](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/start.ts#L228-L234)). `ponder dev` never recovers — it drops and recreates tables on every boot.

## Zero-downtime deploys (views)

The views pattern gives a stable schema name that always points at the latest ready deployment. Each deploy indexes into a fresh schema (e.g. the platform's deployment id), then creates views in a stable `--views-schema` that proxy to it — either manually with `ponder db create-views --schema=<new> --views-schema=<stable>` or automatically when `ponder start --views-schema=<stable>` becomes ready ([bin/commands/createViews.ts#L44-L318](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/createViews.ts#L44-L318)). Consumers always read the stable schema; old deployments are cleaned up later with `ponder db prune` ([docs/pages/docs/production/self-hosting.mdx#L38-L73](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/production/self-hosting.mdx#L38-L73)).

## Health checks & serving

The server exposes `GET /health` (200 as soon as the process is up), `GET /ready` (200 only once the historical backfill is complete, 503 during backfill), `GET /status` (per-chain block/timestamp JSON), and `GET /metrics` (Prometheus) ([server/index.ts#L78-L124](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/server/index.ts#L78-L124)). Point your platform's health check at `/ready` with a generous timeout so it doesn't kill the instance mid-backfill ([docs/pages/docs/production/railway.mdx#L22-L44](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/production/railway.mdx#L22-L44)). For scale, run one `ponder start` indexer plus multiple `ponder serve` API instances against the same schema behind a proxy ([docs/pages/docs/production/self-hosting.mdx#L1-L106](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/docs/pages/docs/production/self-hosting.mdx#L1-L106)).

## Environment variables

Database selection and connection: `DATABASE_URL` (Postgres, else PGlite) with `DATABASE_PRIVATE_URL` taking priority when set ([build/pre.ts#L37-L70](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/pre.ts#L37-L70)). Schema selection: `DATABASE_SCHEMA` (required for `start`, defaults to `public` in dev) and `DATABASE_VIEWS_SCHEMA` for the views pattern ([build/index.ts#L370-L382](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/build/index.ts#L370-L382)). Per-chain RPC URLs use the `PONDER_RPC_URL_{chainId}` convention (e.g. `PONDER_RPC_URL_1`) ([packages/create-ponder/src/index.ts#L272](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/create-ponder/src/index.ts#L272)). Runtime tunables live in the options resolver: `PORT` (42069), `PONDER_LOG_LEVEL` (info), `PONDER_TELEMETRY_DISABLED`, `PONDER_MAX_THREADS` (4, for isolated ordering), and `PONDER_CACHE_BYTES` (RPC cache size, ~1/5 of heap) ([internal/options.ts#L61-L120](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/options.ts#L61-L120)).

## Telemetry & logging

Anonymous telemetry sends a hashed project id (from the git remote or cwd), session id, package versions, and machine stats on a 60-second heartbeat to `ponder.sh/api/telemetry` ([internal/telemetry.ts#L66-L228](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/telemetry.ts#L66-L228)). Disable it by setting `PONDER_TELEMETRY_DISABLED` to any value ([internal/options.ts#L97](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/options.ts#L97)). Logging is Pino-based with `error|warn|info|debug|trace` levels and a `pretty` (human) or `json` (structured) format, controlled by `--log-level`/`--log-format` or `PONDER_LOG_LEVEL` — use `json` in production for log aggregation ([internal/logger.ts#L1-L130](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/logger.ts#L1-L130)).

_Source files: [`packages/core/src/bin/ponder.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/ponder.ts), [`packages/core/src/bin/commands/`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/bin/commands/dev.ts), [`packages/core/src/database/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/database/index.ts), [`packages/core/src/server/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/server/index.ts), [`packages/core/src/internal/options.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/options.ts), [`packages/core/src/internal/telemetry.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/src/internal/telemetry.ts), [`packages/create-ponder/src/index.ts`](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/create-ponder/src/index.ts), all at commit `c8f6935`._
