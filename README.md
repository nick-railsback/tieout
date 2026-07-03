# Tieout

> **Independently-verifiable reconciliation for onchain institutional positions.**
> Tie the chain out to your books — and let your examiner reproduce it, trusting no one.

**Status:** 🟡 Early-stage. Design complete; MVP in progress. Not legal, financial, or tax advice.

---

## The problem

A mid-size registered investment adviser (RIA) decides to hold ETH onchain — staked, or as a tokenized position. The person on the hook is the **Head of Operations & Compliance**. She isn't crypto-hostile; she's *liability-aware*.

Under the Investment Advisers Act **custody rule**, an adviser that can move client assets has *custody* — and custody triggers an **annual, no-notice independent verification of those assets by an outside accountant** (filed on Form ADV‑E). For traditional assets, a custodian's statement suffices. For onchain assets, neither she nor her auditor has a good way to **independently verify** that the positions exist and tie out to the books.

Today, the tools that reconcile crypto holdings do it *as the trusted intermediary* — "trust our API, the books are right." That quietly re-introduces the exact trust assumption Ethereum was built to remove.

## What Tieout is

Tieout is a **deterministic reconciliation engine** that rebuilds an institution's onchain position from public chain data and reconciles it against an internal ledger — and produces evidence anyone can reproduce.

- **`tieout verify`** — a one-command verifier the *auditor* runs. It re-derives the reconciliation from public chain data and confirms it reproduces the **same cryptographic hash** — trusting neither the adviser nor a custodial API.
- **Explain-itself discrepancies** — when the books and the chain disagree, Tieout names the exact onchain event that broke the tie-out and explains it in plain English. Correct *and* legible.
- **"CI for compliance"** — the reconciliation runs continuously, like a test suite. A failing tie-out is a red build that surfaces *before* the examiner does, not a year-end scramble.

The evidence's hash is anchored onchain (a single thin attestation contract), making each reconciliation **tamper-evident**.

## What it deliberately does *not* claim

This is a **judgment claim, not a market claim.** Custodial reconciliation tools exist and are good at what they do. Tieout's narrow, defensible contribution is the part they *structurally can't* offer: reconciliation that is **non-custodial and independently reproducible from public data**. What is verifiable is the *onchain-derived position* and the *commitment to it* — **not** the honesty of an institution's private books, which no tool can vouch for.

## How it works

```
 public chain data (read-only)            deterministic mock vault (tests)
  Transfer logs · rebase events  ─┐        controlled deposits/rewards/reorgs ─┐
  share-price @ block (archive)   │                                            │
                                  ▼                                            ▼
                       ┌────────  indexer (Ponder)  ────────┐
                       │  normalized events + rate curve,    │
                       │  ordered (block, txIdx, logIdx)     │
                       └──────────────────┬──────────────────┘
                                          ▼
              ledger ──►  ┌──  reconciliation engine (pure, bigint)  ──┐
              export      │  lots · cost basis · reward · diff         │ ─►  report.json + HASH
                          └────────────────────┬───────────────────────┘
                          ┌───────────────────┴───────────────────┐
                          ▼                                        ▼
             attestation contract (anchors HASH)         web UI (live data + the diff)
```

**Design rules that make verification real:**
- Pin the cutoff to a **finalized** block — never read `latest` in a canonical run (reorg-safe).
- **Integer math only** (wei / shares as `bigint`, rates as 1e18 fixed-point) — no float drift, or the hash won't reproduce.
- The engine core is a **pure function**: `(events, rateCurve, ledger, [startBlock, endBlock]) → report + hash`. Same inputs → same hash, on any machine.
- Token addresses come from a **verified, `cast`-checked table** — never hardcoded from memory.

## Quickstart

**Prerequisites** (all version-pinned for byte-reproducible output):

| Tool | Version | Pin |
|---|---|---|
| Node | 24.x | `.nvmrc`, `engines.node` |
| pnpm | 11.9.0 | `packageManager` (via Corepack) |
| Foundry (`forge`/`cast`/`anvil`) | v1.7.1 | for `packages/contracts` |
| solc | 0.8.35 | auto-fetched by `forge` (`foundry.toml`) |

```bash
pnpm install
pnpm -r build
pnpm -r test                          # Node suites: recon, addresses, indexer, web
forge test --root packages/contracts  # Solidity suites (Foundry)
```

**Reproduce a reconciliation yourself** — the auditor's path. Point `verify` at a
committed slice fixture; it re-derives the manifest from public chain data over the
report's pinned block range and confirms it reproduces the same `reportHash`,
trusting neither the adviser nor a custodial API (needs a mainnet **archive** RPC):

```bash
ETH_RPC_URL=<mainnet-archive-rpc-url> \
  pnpm --filter @tieout/recon verify \
  fixtures/slice/report.json fixtures/slice/ledger.json
# exit 0 on full byte-identical reproduction; 1 on any typed failure
```

## Repository layout

| Package | What it holds |
|---|---|
| `packages/contracts` | The thin attestation contract + a `MockStakedVault` (ERC-4626) for deterministic tests (Foundry). |
| `packages/indexer` | Ponder indexer: Transfer + rebase events → ordered, normalized stream. |
| `packages/recon` | The pure, deterministic reconciliation engine + its test suite. *(The heart.)* |
| `apps/web` | Minimal UI: live positions (Multicall + WebSocket) and the explain-itself diff. |
| `docs/` | The architecture spine (`ARCHITECTURE-SPINE.md`) + an interactive deck (`architecture-deck.html`). |

## Roadmap

- **MVP:** one real liquid-staking position (e.g. wstETH), a finalized window, a signed `report.json` + onchain hash anchor, and `tieout verify` reproducing it — exercising at least one genuinely hard path (a discrepancy + a dual-derivation rate cross-check).
- **Then:** multi-address aggregation, more asset types (tokenized treasuries, stablecoins), the continuous "CI" runner.
- **Vision (not built):** a **zero-knowledge proof of correct reconciliation** — verifiable by anyone, revealing nothing — and an **open attestation standard** auditors could coalesce around. The endgame is making an institution's first onchain audit *boring*.

## Provenance

Born from a structured design-thinking + adversarial-roundtable session, grounded in the Series 65 manual, the State of DeFi 2025 / a16z State of Crypto 2025 reports, and the ethskills Ethereum knowledge base.

---

*Tieout is a portfolio project. It is not legal, financial, regulatory, or tax advice; nothing here should be relied on for compliance decisions. Consult qualified counsel and a licensed accountant.*
