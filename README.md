# Tieout

Tieout rebuilds a staked-ETH (wstETH) position from public Ethereum data, reconciles it
line-by-line against an internal ledger, and emits a report plus its keccak256 hash.
One command re-derives the same hash, byte for byte, from any mainnet archive RPC:

```bash
ETH_RPC_URL=<mainnet-archive-rpc> pnpm --filter @tieout/recon verify \
  fixtures/slice/report.json fixtures/slice/ledger.json
```

The demo is live at [tieout.eth.limo](https://tieout.eth.limo), and the demo report's
hash is anchored in the `AttestationRegistry` on Base mainnet — read it back with one
`eth_call` ([recipe](packages/contracts/README.md)).

## Who it's for

The target user is compliance/operations at a registered investment adviser (RIA). Under
the SEC **custody rule**, an adviser that can move client assets has custody — and custody
triggers an annual, no-notice verification of those assets by an independent accountant.
For traditional assets, a custodian's statement suffices. For onchain assets, neither the
adviser nor the accountant has a good way to *independently* verify that the positions
exist and tie out to the books.

The crypto-reconciliation tools that exist today work as a *trusted intermediary* —
"connect to our API, trust our report." For an audit whose entire point is independent
verification, that's circular: it replaces trusting the adviser with trusting a SaaS
vendor. Tieout's contribution is structural: **the evidence is reproducible by the
verifier from public data, with open code, trusting no one.** Tieout is the tool the
*accountant* runs.

## What it does

1. **The reconciliation engine** (`packages/recon`) — a pure function. Give it
   a "manifest" (the relevant blockchain events over a pinned block window) and a ledger
   (your books), and it returns a report plus its hash. It contains zero network calls,
   zero clock reads, or zero floating-point math — making the output
   byte-identical on any machine. It reconciles two axes: **closing shares** (does the
   chain balance match the sum of your booked lots?) and **reward** (does the staking
   yield the chain says you earned match what you booked?).

2. **The verifier** (`tieout verify`, in `packages/recon/src/bin/`) — the auditor's one
   command. It re-downloads the raw blockchain events itself from any archive RPC
   endpoint, rebuilds the manifest from scratch, re-runs the engine, and confirms the
   hash matches. It trusts nothing the adviser produced except the pinned block
   numbers/hashes and the ledger file, both of which are inputs it checks. It also checks a detached author signature (EIP-712) on a separate output
   line, so "the math reproduces" and "the author committed to it" are two independent
   statements.

3. **The onchain anchor** (`packages/contracts` — `AttestationRegistry`) — a small
   contract with one job: recording that "this report hash existed at this block/time." The first
   write wins, anyone can call it, repeat calls are harmless no-ops. It deliberately
   proves *only a timestamp* — not correctness, not identity.

4. **USD valuation** — the report values the position in dollars using a Chainlink price
   feed reading pinned to a specific round at the window's end block. Even the dollar
   figure reproduces byte-for-byte; it never reads a "current" price.

5. **The web surface** (`apps/web`) — a small static page showing the live position
   (streamed from mainnet), the reconciliation report with its discrepancy explanation in
   plain English, the USD figures, the report hash, and the anchor status.

There is also a sixth piece, the **Ponder indexer** (`packages/indexer`), which is
intentionally half-built: it records chain events into a database, but nothing reads them
back yet. It's *not* part of the trust story — the verifier always fetches its own data. It exists to accomodate a future "continuous monitoring" feature.

## What it deliberately does *not* claim

A green `verify` means "the derivation from public chain data reproduced, and the author
committed to it." It does **not** mean "the books are right." No tool can prove a private
ledger is honest or complete.

When books and chain *do* disagree, Tieout doesn't just say "mismatch": it names the
exact onchain event that broke the tie-out (transaction hash, block, log index) and
narrates the likely cause in plain English, generated mechanically from engine output.

## Try it

**Prerequisites** (all version-pinned for byte-reproducible output):

| Tool | Version | Pin |
|---|---|---|
| Node | 24.x | `.nvmrc`, `engines.node` |
| pnpm | 11.9.0 | `packageManager` (via Corepack) |
| Foundry (`forge`/`cast`/`anvil`) | v1.7.1 | for `packages/contracts` |
| solc | 0.8.35 | auto-fetched by `forge` (`foundry.toml`) |

```bash
# forge-std is a git submodule (packages/contracts/lib/forge-std); clone WITH
# submodules or the Foundry suite fails on unresolved forge-std/Test.sol imports.
git clone --recurse-submodules <repo-url> tieout && cd tieout
# Already cloned without them? Run once:  git submodule update --init --recursive

pnpm install
pnpm -r build
pnpm -r test                          # Node suites: recon, addresses, indexer, web
forge test --root packages/contracts  # Solidity suites (Foundry)
```

Then reproduce a reconciliation yourself. Point `verify` at the
committed demo fixture (a *real* mainnet wallet over a pinned 255-block
window, with a deliberately injected 1-gwei bookkeeping error so the discrepancy path is
exercised). You need a mainnet **archive** RPC, a provider that can answer "what was the
state at block X" for old blocks; most free tiers include this:

```bash
ETH_RPC_URL=<mainnet-archive-rpc-url> \
  pnpm --filter @tieout/recon verify \
  fixtures/slice/report.json fixtures/slice/ledger.json
# exit 0 on full byte-identical reproduction; 1 on any typed failure
```

Exit code 0 means: it re-downloaded the events, rebuilt everything, and reproduced the
exact hash in the report. This *is* the product; everything else is packaging. Then try
to cheat it:

- Edit one digit anywhere in a copy of `fixtures/slice/report.json` → `verify` fails with
  a clean one-line typed error (never a stack trace — that failure contract is itself
  pinned by tests).
- Edit the ledger copy (say, bump `bookedReward`) → the hashes no longer reproduce.
- Run it on a second machine, or note that the `determinism` job in
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) already runs it on two
  independent runners (optionally against two different RPC providers) on every push,
  and red if the hashes disagree.

## How it works

```
        public chain data (any archive RPC)         ledger export (the books)
                        │                                     │
             ┌──────────▼──────────┐                          │
             │  shared derivation  │  one pure function —     │
             │   logs → manifest   │  fed by BOTH the verify  │
             └──────────┬──────────┘  CLI and the Ponder      │
                        │             adapter (AD-9)          │
                        ▼                                     ▼
             ┌────────────────────────────────────────────────────┐
             │        recon engine (pure, bigint-only)            │
             │  closing-shares + reward tie-out, USD valuation    │
             └──────────────────────────┬─────────────────────────┘
                                        ▼
                          report.json + reportHash (keccak256)
                            ┌───────────┴───────────┐
                            ▼                       ▼
                 AttestationRegistry (Base)      apps/web
                 anchors the hash —              live position + the
                 timestamp only                  explain-itself diff
```

**Design rules that make verification real** (the full set lives in
[`docs/ARCHITECTURE-SPINE.md`](docs/ARCHITECTURE-SPINE.md), AD-1..AD-20):

- Pin **both** window endpoints to **finalized** `(blockNumber, blockHash)` pairs. Never
  read `latest` in a canonical run (reorg-safe).
- **Integer math only** (wei/shares as `bigint`, rates as 1e18 fixed-point,
  multiply-before-divide with exactly one division). No float ever touches the hash.
- The engine core is a **pure function**: `(manifest, ledger) → (report, reportHash)`.
  Same inputs → same hash, on any machine.
- Canonical bytes are **RFC 8785 (JCS)** from a single canonicalizer module, hashed with
  Ethereum **keccak256**, so "the same data" always means the same bytes.
- Token and feed addresses come from a **verified, `cast`-checked table** — never
  hardcoded from memory.

## Repository layout

| Path | What it holds |
|---|---|
| `packages/recon` | The pure reconciliation engine, canonicalizer, narration, and the `verify` / `pin-slice` CLIs. |
| `packages/contracts` | `AttestationRegistry` + `MockStakedVault` (ERC-4626 test double, never deployed to hold value). Foundry. |
| `packages/indexer` | Ponder event accumulator (write-only today; not on the trust path). |
| `apps/web` | The static demo surface: live position, explain-itself diff, anchor status. |
| `addresses/` | The single source of every chain address, checksum-guarded at build time. |
| `docs/` | The architecture spine (`ARCHITECTURE-SPINE.md`) + an interactive deck (`architecture-deck.html`). |

## Where this came from

I've been interested in the Ethereum ecosystem since ~2020. Recently I've been reading resources in preparation for the Series 65 exam (the investment-adviser side of traditional finance). I distilled both into context packs with my own tooling: a pack from my exam study materials, and a DeFi pack built from four public 2025–2026 reports (the State of DeFi 2025 and a16z's State of Crypto 2025 among them).

With both packs loaded, I ran a deliberate opportunity-scouting session: where traditional finance meets DeFi, which capabilities that TradFi takes for granted — custody, clearing, adviser compliance — still have no good onchain equivalent, and which of those gaps could one person realistically start building against? 

Near the top of the session's ranked shortlist was custody-rule surprise verification backed by independently reproducible onchain evidence. That entry became tieout.

Building on Ethereum needed one more grounding layer: Austin Griffith's public
[ethskills](https://github.com/austintgriffith/ethskills) knowledge base, reduced to a
context pack, carried the architecture planning.

## How it was built

Tieout was built AI-natively. I directed coding agents against versioned specs rather
than writing most of the code by hand. Each unit of work started as a written spec —
intent, boundaries, an edge-case matrix, and the exact verification commands that had to
pass, which agents executed against.


The part most AI-assisted projects skip is grounding. Training data can't stay current
on fast-moving, version-pinned tooling: an agent that "knows" Foundry or viem from
training is confidently wrong about the pinned versions this repo actually uses. So the
agents worked with context packs built by
[skill-engine](https://github.com/nick-railsback/skill-engine), my plugin for distilling
a source at a pinned commit into a navigable, citation-backed skill. The five packs that
carried this project are published in this repo:

- [`foundry-context`](.claude/skills/foundry-context/) — forge/cast/anvil/chisel,
  distilled from the Foundry source at a pinned upstream commit.
- [`viem-context`](.claude/skills/viem-context/) — viem 2.54.1, the pinned TypeScript
  Ethereum interface.
- [`ponder-context`](.claude/skills/ponder-context/) — Ponder 0.16.6, the indexing
  framework behind `packages/indexer`.
- [`ethskills-context-pack`](.claude/skills/ethskills-context-pack/) — Austin
  Griffith's [ethskills](https://github.com/austintgriffith/ethskills) knowledge base, reduced to a single `SKILL.md` and complimentary `references/` files, 
  which carried the architecture planning.
- [`defi-context`](.claude/skills/defi-context/) — the four public 2025–2026 DeFi
  reports the opportunity-scouting session ran on.

The tool packs cite their sources at exact upstream commits; the report pack cites page
numbers against content-hashed PDFs.

## Roadmap

- **v0.1.0 (this release):** one real wstETH position, a pinned finalized window, a
  signed `report.json` + hash that `tieout verify` reproduces from public data on two
  independent CI runners; the `AttestationRegistry` deployed and source-verified on Base
  with the demo report's hash anchored; the demo site pinned to IPFS behind the
  `tieout.eth` ENS name — content-addressed hosting for a hash-addressed report.
- **Then:** the indexer read-back and the continuous "CI for compliance" runner,
  multi-address aggregation, more asset types (tokenized treasuries, stablecoins).
- **Deliberately not built:** wallet connect, client-side report generation, in-browser
  verify, downloadable reports, address lookup. Some are parked on plain scope
  discipline (a solo maintainer, a tax-adjacent domain); the rest would have tieout act
  on a visitor's behalf — a *trusted intermediary*, the exact role the product exists to
  eliminate. The demand signals behind them are recorded, and they'll be revisited
  deliberately, not by accretion.
- **Vision (not built):** a **zero-knowledge proof of correct reconciliation** —
  verifiable by anyone, revealing nothing — and an **open attestation standard** auditors
  could coalesce around. The report is already Merkle-shaped so ZK can be added without
  reshaping anything. The endgame is making an institution's first onchain audit
  *boring*.

---

*Tieout is a portfolio project. It is not legal, financial, regulatory, or tax advice;
nothing here should be relied on for compliance decisions. Consult qualified counsel and
a licensed accountant.*
