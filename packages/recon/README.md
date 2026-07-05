# @tieout/recon

The pure, deterministic reconciliation engine — **the heart of Tieout**. Given a
manifest (events + rate curve, derived from public chain data) and an internal
ledger, it produces a `report.json` and a `reportHash` that any machine
reproduces byte-for-byte.

## The pure-core contract

The engine core is a pure function (AD-1) — no I/O, no clocks, no floats:

```
recon(manifest, ledger) -> { report, reportHash }
```

- **Integer math only** — wei/shares as `bigint`, rates as 1e18 fixed-point;
  exactly one truncating division (AD-2). No `number` ever enters the hash path.
- **One canonicalizer** — `canonical.ts` is the only module that produces hashed
  bytes: RFC-8785 (JCS) key ordering, NFC-normalized strings, `keccak256`
  binding (AD-11/12). "There is no second serializer."
- **Version-skewed first** — `engineVersion` (the determinism *fingerprint*, see
  `VERSIONS.md`) is asserted before any math, so a mismatch reads as version
  skew, not a bare hash failure (AD-8).

## Module map

| Module | Role |
|---|---|
| `canonical.ts` | The one JCS canonicalizer + `keccak256` binding (owns `compareCodeUnits`). |
| `manifest.ts` / `ledger.ts` | The typed input contracts + validators + their hashes (AD-7/AD-20). |
| `recon.ts` | The pure two-axis engine (closing-shares + reward) → report + hash. |
| `derivation.ts` | The ONE shared `derive` (raw logs → manifest, AD-9), used by both `verify` and the Ponder adapter, with `events.ts`/`filter.ts`/`rawlog.ts`. |
| `reconstruct.ts` / `l0fetch.ts` | Re-fetch + re-derive the manifest from an L0 RPC over a pinned range (the `verify` spine). |
| `ratecurve.ts` / `crosscheck.ts` / `priceobs.ts` | AD-6 rate curve, the exact archive cross-check, and the AD-18 price observation. |
| `narrate.ts` | Presentational explain-itself narration + `parseReportJson` (the report hydrator the web renders through). Never enters the hashed bytes. |
| `signature.ts` | Detached EIP-712 author signature over `reportHash` (AD-19). |
| `version.ts` / `slice.ts` | The engine fingerprint + schema versions, and the shared pinned slice block range. |

## CLIs (`src/bin/`)

```sh
pnpm build                                    # compile to dist/ (downstream consumers read dist)

# Re-derive a shipped report from public chain data and confirm its reportHash
# (the auditor's trustless path). Needs a mainnet ARCHIVE endpoint.
ETH_RPC_URL=<archive-rpc> pnpm verify fixtures/slice/report.json fixtures/slice/ledger.json

# Optional VERIFY_CHUNK sets the eth_getLogs block-range per chunk (default 9,
# under the free tier's ~10-block cap). On a higher-range endpoint, raise it to
# fetch large windows far faster — a pure fetch knob; determinism is chunk-
# independent so it never changes the manifest hash.
ETH_RPC_URL=<archive-rpc> VERIFY_CHUNK=2000 pnpm verify fixtures/slice/report.json fixtures/slice/ledger.json

# Regenerate the hand-authored golden fixture (pure — no RPC).
pnpm gen:golden

# Re-pin the real mainnet discrepancy slice (needs ETH_RPC_URL; writes fixtures/slice/).
ETH_RPC_URL=<archive-rpc> pnpm gen:slice
```

## Fixtures

- `fixtures/golden/` — a hand-authored `(manifest, ledger)` pair with a reward
  discrepancy; the single-machine determinism gate (`determinism.test.ts`) pins
  its byte-exact report + hash.
- `fixtures/slice/` — a **real** mainnet window (blocks `25_444_667`–`25_444_922`,
  single-sourced via `slice.ts`) with a booked-vs-chain reward discrepancy
  injected through the typed ledger schema; the CI cross-machine gate re-derives
  it from public data and must reproduce the committed `reportHash`.

## Build & test

```sh
pnpm build && pnpm test && pnpm typecheck
```

Requires the pinned stack (Node 24, pnpm 11.9). Tests run on Node's built-in
`node:test` with native TS type-stripping — no bundler.
