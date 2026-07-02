# @tieout/indexer

Ponder **0.16.6** indexer. **Scaffold only in Batch 1** — it installs and builds
under the pinned stack but does no indexing. The shared raw-logs → manifest
derivation adapter (AD-9) is **Batch 2** (Story 2.2).

Ponder declares `hono`, `viem`, and `typescript` as **peer** dependencies, so
this package brings its own copies
([ponder@0.16.6 core/package.json#L58-L67](https://github.com/ponder-sh/ponder/blob/c8f6935fb65176c01b40cae9056be704c0e5318e/packages/core/package.json#L58-L67)).

## Commands

```sh
pnpm --filter @tieout/indexer build      # ponder codegen (generates ponder-env.d.ts)
pnpm --filter @tieout/indexer typecheck  # ponder codegen && tsc --noEmit
pnpm --filter @tieout/indexer start      # ponder start  (production runner)
```

> Ponder 0.16.6 has no `ponder typecheck` subcommand; type-checking is plain
> `tsc --noEmit` against the codegen-generated `ponder-env.d.ts`.

## Determinism & ops rules (enforced from Batch 2)

- **Use `ponder start`, never `ponder dev`.** `dev` drops and recreates tables
  and disables crash recovery — incompatible with the NFR-0 determinism harness
  (Batch 2, Story 2.8).
- **Set `PONDER_TELEMETRY_DISABLED=1`** — telemetry is on by default (60s
  heartbeat).
- **Database:** with `DATABASE_URL` set Ponder uses Postgres; otherwise embedded
  PGlite for local dev. CI runners set `DATABASE_SCHEMA`.

See `.env.example` for the environment surface.
