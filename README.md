# Tieout

> **Does the crypto position on the blockchain match what the accounting books say — and
> can an outsider check that without trusting us?**
> Tieout answers that question with cryptographic force.

## TL;DR

- **What it is:** Tieout rebuilds a staked-ETH (wstETH) position purely from public
  blockchain data, ties it out line-by-line against internal books, and emits a report
  plus its keccak256 hash.
- **What makes it different:** nobody has to take the report on trust — anyone can
  reproduce it. One command, `tieout verify`, against a mainnet archive RPC re-derives
  the exact same hash, byte for byte, on their own machine.
- **Where it runs:** 🟢 **v0.1.0 — released.** Live at
  **[tieout.eth.limo](https://tieout.eth.limo)**; the `AttestationRegistry` is deployed
  and source-verified on Base mainnet with the demo report's hash anchored onchain.
  (Not legal, financial, or tax advice.)
- **How fast it shipped:** first commit to mainnet-anchored release in **five days** —
  check the git history.

## Measured results

Nothing below asks to be believed — each item names where a skeptic checks it:

- **Byte-identical hashes on two independent CI runners, on every push to main and
  feature branches** — the NFR-0 determinism gate; the `determinism` job in
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) fails red if the runners
  disagree.
- **Demo report hash anchored on Base mainnet** (block 48287188) — read it back from the
  chain in one `eth_call` ([recipe](packages/contracts/README.md)), or see the anchor
  panel at [tieout.eth.limo](https://tieout.eth.limo).
- **First commit → mainnet-anchored release in five days** — `git log`: `0fcdbed`
  (2026-07-02) to `44f0a0a` (2026-07-07).
- **53 health-audit findings remediated across two full audits** — the second audit's 36
  fixes are directly in the public history: one conventional commit per finding-cluster,
  subject citing its finding IDs (`git log --grep` for `REL-`, `SEC-`, `TEST-`), each
  code fix carrying its regression test in the same commit.
- **The failure contract is itself pinned by tests** — `verify` exits with a one-line
  typed error, never a stack trace
  ([`packages/recon/test/verify.test.ts`](packages/recon/test/verify.test.ts)).

---

## The one-paragraph version

Tieout rebuilds a staked-ETH position (wstETH) purely from public blockchain data,
compares it line-by-line against an internal ledger file, and emits a report plus a short
fingerprint of that report (a keccak256 hash). Anyone — an auditor, a regulator, a
skeptic — can run one command, `tieout verify`, pointed at any public Ethereum data
provider, and re-derive the exact same fingerprint on their own machine. If even one byte
of the story were different, the fingerprint would not match. That fingerprint can also
be anchored on a blockchain (Base), so there is tamper-proof evidence of *when* the
reconciliation existed.

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

## What it actually does — the five pieces

1. **The reconciliation engine** (`packages/recon`) — the heart. A pure function: give it
   a "manifest" (the relevant blockchain events over a pinned block window) and a ledger
   (your books), and it returns a report plus its hash. It contains zero network calls,
   zero clock reads, zero floating-point math — that's what makes the output
   byte-identical on any machine. It reconciles two axes: **closing shares** (does the
   chain balance match the sum of your booked lots?) and **reward** (does the staking
   yield the chain says you earned match what you booked?).

2. **The verifier** (`tieout verify`, in `packages/recon/src/bin/`) — the auditor's one
   command. It re-downloads the raw blockchain events itself from any archive RPC
   endpoint, rebuilds the manifest from scratch, re-runs the engine, and confirms the
   hash matches. It trusts nothing the adviser produced except the pinned block
   numbers/hashes and the ledger file — both of which are inputs it checks, not facts it
   assumes. It also checks a detached author signature (EIP-712) on a separate output
   line, so "the math reproduces" and "the author committed to it" are two independent
   statements.

3. **The onchain anchor** (`packages/contracts` — `AttestationRegistry`) — a tiny
   contract with one job: record "this report hash existed at this block/time." First
   write wins, anyone can call it, repeat calls are harmless no-ops. It deliberately
   proves *only a timestamp* — never correctness, never identity.

4. **USD valuation** — the report values the position in dollars using a Chainlink price
   feed reading pinned to a specific round at the window's end block. Even the dollar
   figure reproduces byte-for-byte; it never reads a "current" price.

5. **The web surface** (`apps/web`) — a small static page showing the live position
   (streamed from mainnet), the reconciliation report with its discrepancy explanation in
   plain English, the USD figures, the report hash, and the anchor status.

There is also a sixth piece, the **Ponder indexer** (`packages/indexer`), which is
intentionally half-built: it records chain events into a database, but nothing reads them
back yet. It is *not* part of the trust story — the verifier always fetches its own data
— and it exists for the future "continuous monitoring" feature.

## What it deliberately does *not* claim

A green `verify` means "the derivation from public chain data reproduced, and the author
committed to it." It does **not** mean "the books are right." No tool can prove a private
ledger is honest or complete — and every surface here (CLI output, web copy, this README)
states that explicitly.

When books and chain *do* disagree, Tieout doesn't just say "mismatch": it names the
exact onchain event that broke the tie-out (transaction hash, block, log index) and
narrates the likely cause in plain English — generated mechanically from engine output,
never hand-written, so it can't lie.

## Try it — and try to cheat it

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

**The headline act** — reproduce a reconciliation yourself, the auditor's path. Point
`verify` at the committed demo fixture (a *real* mainnet wallet over a pinned 255-block
window, with a deliberately injected 1-gwei bookkeeping error so the discrepancy path is
exercised). You need a mainnet **archive** RPC — a provider that can answer "what was the
state at block X" for old blocks; free tiers include this:

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
- Run it on a second machine — or note that CI already runs it on two independent
  runners (optionally against two different RPC providers) on every push, and the hashes
  must match. That property is called **NFR-0** throughout the docs; it is the project's
  entire promise.

## How it works (for engineers)

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

- Pin **both** window endpoints to **finalized** `(blockNumber, blockHash)` pairs — never
  read `latest` in a canonical run (reorg-safe).
- **Integer math only** (wei/shares as `bigint`, rates as 1e18 fixed-point,
  multiply-before-divide with exactly one division) — no float ever touches the hash.
- The engine core is a **pure function**: `(manifest, ledger) → (report, reportHash)`.
  Same inputs → same hash, on any machine.
- Canonical bytes are **RFC 8785 (JCS)** from a single canonicalizer module, hashed with
  Ethereum **keccak256** — so "the same data" always means the same bytes.
- Token and feed addresses come from a **verified, `cast`-checked table** — never
  hardcoded from memory.

## Repository layout

| Path | What it holds |
|---|---|
| `packages/recon` | The pure reconciliation engine, canonicalizer, narration, and the `verify` / `pin-slice` CLIs. *(The heart.)* |
| `packages/contracts` | `AttestationRegistry` (the anchor) + `MockStakedVault` (ERC-4626 test double — never deployed to hold value). Foundry. |
| `packages/indexer` | Ponder event accumulator (write-only today; not on the trust path). |
| `apps/web` | The static demo surface: live position, explain-itself diff, anchor status. |
| `addresses/` | The single source of every chain address, checksum-guarded at build time. |
| `docs/` | The architecture spine (`ARCHITECTURE-SPINE.md`) + an interactive deck (`architecture-deck.html`). |

## Roadmap

- **v0.1.0 (this release):** one real wstETH position, a pinned finalized window, a
  signed `report.json` + hash that `tieout verify` reproduces from public data on two
  independent CI runners; the `AttestationRegistry` deployed and source-verified on Base
  with the demo report's hash anchored; the demo site pinned to IPFS behind the
  `tieout.eth` ENS name — content-addressed hosting for a hash-addressed report.
- **Then:** the indexer read-back and the continuous "CI for compliance" runner,
  multi-address aggregation, more asset types (tokenized treasuries, stablecoins).
- **Vision (not built):** a **zero-knowledge proof of correct reconciliation** —
  verifiable by anyone, revealing nothing — and an **open attestation standard** auditors
  could coalesce around. The report is already Merkle-shaped so ZK can be added without
  reshaping anything. The endgame is making an institution's first onchain audit
  *boring*.

## Where this came from

Two threads ran in parallel before any of this existed: studying for the Series 65 exam
(the investment-adviser side of traditional finance) and roughly six years of standing
interest in the Ethereum ecosystem. I distilled both into context packs with my own
tooling — a private pack from my exam study materials, and a DeFi pack built from four
public 2025–2026 reports (the State of DeFi 2025 and a16z's State of Crypto 2025 among
them).

With both packs loaded, I ran a deliberate opportunity-scouting session: where
traditional finance meets DeFi, which capabilities that TradFi takes for granted —
custody, clearing, adviser compliance — still have no good onchain equivalent, and
which of those gaps could one person realistically start building against? The session
produced a ranked shortlist; near its top sat custody-rule surprise verification backed
by independently reproducible onchain evidence. That entry became tieout, and the concept
was pressure-tested in a structured design-thinking + adversarial-roundtable session
before any code was written.

Building on Ethereum needed one more grounding layer: Austin Griffith's public
[ethskills](https://github.com/austintgriffith/ethskills) knowledge base, reduced to a
context pack, carried the architecture planning. From there the public record tells the
rest: first commit `0fcdbed` on 2026-07-02, mainnet-anchored v0.1.0 release `44f0a0a` on
2026-07-07 — **first commit to mainnet-anchored release in five days**, all of it
verifiable from the git history.

## How it was built

Tieout was built AI-natively: I directed coding agents against versioned specs rather
than writing most of the code by hand. Each unit of work started as a written spec —
intent, boundaries, an edge-case matrix, and the exact verification commands that had to
pass — and agents executed against it in reviewed batches. What I owned outright was the
architecture and the verification: the invariants in
[`docs/ARCHITECTURE-SPINE.md`](docs/ARCHITECTURE-SPINE.md), the determinism gate that
reproduces the report hash on two independent CI runners, and the adversarial code
reviews and codebase health audits whose findings landed as their own remediation
commits — you can see them cited by number in the git history.

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
  Griffith's [ethskills](https://github.com/austintgriffith/ethskills) knowledge base,
  which carried the architecture planning.
- [`defi-context`](.claude/skills/defi-context/) — the four public 2025–2026 DeFi
  reports the opportunity-scouting session ran on.

The tool packs cite their sources at exact upstream commits; the report pack cites page
numbers against content-hashed PDFs. That discipline is deliberate: the method that
built tieout is the method tieout sells — don't trust what an agent (or an institution)
remembers; pin the source and verify against it.

---

*Tieout is a portfolio project. It is not legal, financial, regulatory, or tax advice;
nothing here should be relied on for compliance decisions. Consult qualified counsel and
a licensed accountant.*
