# @tieout/indexer

Ponder **0.16.6** indexer. **Batch 2 (Story 2.2)** implements the live adapter:
two log sources — wstETH `Transfer` and Lido/stETH `TokenRebased` — over the
pinned slice, an indexing handler that assembles the shared `RawLog`
(`src/adapter.ts`) and accumulates it idempotently (keyed by `event.id`), and a
parity test proving the Ponder-assembled path and the `verify` `eth_getLogs`
path produce a **byte-identical manifest** (AC-2.2.d). Ponder is **NOT** on the
verify path — it feeds the SAME `@tieout/recon` `derive` (AD-9).

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
- **RPC:** mainnet via `PONDER_RPC_URL_1` (same archive endpoint as
  `ETH_RPC_URL`). An ephemeral CI store forfeits the `ponder_sync` RPC cache — a
  cost concern, not a correctness one.

See `.env.example` for the environment surface.
