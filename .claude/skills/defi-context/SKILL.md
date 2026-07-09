---
name: defi-context
description: "Answers questions across four 2025-2026 DeFi reports — a16z's State of Crypto 2025, DLNews/DeFiLlama's State of DeFi 2025, the CRS DeFi primer (R48883), and Lewis's safe-harbor economic analysis. Strong on what exists on which chain (Ethereum L1/L2s, Solana, others) and on where DeFi is heading — growth vectors, the 2026 outlook, and where value is captured. References load on demand from references/."
---

# Context navigator (multi-source)

## Overview

This navigator catalogs references for **multiple sources** the engine has been pointed at. Each source's references are catalogued in their own `## Catalog: <source-slug>` section below; references live in `references/<source-slug>-<topic>.md` so the filename prefix discriminates sources at-a-glance.

The navigator's standing instructions stay small; references load only when relevant to the current question. The catalog itself is a TOC and is excluded from the standing-instructions budget, so additional sources and rows can be added without trimming prose.

When asked a question:

1. Identify which source the question is about — see "How to search this navigator" below.
2. Scan that source's **Catalog** section for the matching topic.
3. Follow the link to read the reference file.
4. If the question spans multiple sources, consult the **Cross-source map**.

## Sources

This skill distills four DeFi reports. All four are publicly available and free.

1. **DLNews / DeFiLlama / DL Research, *State of DeFi 2025*** (2025, 121 pp) — covers calendar-year 2025. Catalog slug: `state-of-defi-2025`.
2. **a16z crypto, *State of Crypto 2025*** (2025, 54 pp) — figures as of September 30, 2025. Catalog slug: `state-of-crypto-2025-a16z-crypto`.
3. **Congressional Research Service, *An Overview of Decentralized Finance (DeFi)*** (Report R48883, Version 2, by Paul Tierno, March 16, 2026) — a nonpartisan primer prepared for Members and Committees of Congress. Catalog slug: `r48883-2`.
4. **Craig M. Lewis (Vanderbilt University; former SEC Chief Economist), *Economic Analysis of the DeFi Front-End Safe Harbor*** (white paper, April 7, 2026) — written with financial support from a16z to inform SEC staff; treat as advocacy. Catalog slug: `ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026`.

## Claims policy

Cite by default, and make load-bearing claims verifiable:

1. **Inline-cite every load-bearing claim with its source anchor.** These four sources are local PDFs, not git repos, so the anchor is the **PDF page number** the reference gives for that fact (e.g. *(State of DeFi 2025, p.78)*), backed by the reference's stated content-hash. Put the page cite inline, on the claim — versions, figures, definitions, per-chain numbers, and anything a reader could get wrong by guessing. (The SHA-pinned-permalink form in the engine's grounded-citation eval assumes git sources; for these PDF `local-path` sources the page+content-hash citation is the equivalent verification anchor.)
2. Don't cite orientational prose — *"what is DeFi?"*, *"what is this report?"* — answer those from this navigator alone; opening a reference is itself a citation gesture.
3. End with a one-line provenance footer, emitted italic, formatted `*References consulted: foo.md, bar.md. Grounded in {{LIBRARY}}@{{VERSION}} — [reference index]({{INDEX_URL}}).*` The footer is a **summary of what you read — not a substitute** for the inline page cites on the claims. Tokens are agent-substituted at answer time; across multiple sources, `{{LIBRARY}}` resolves to the source slug(s) the answer drew from, or every registered slug when no reference was opened.
4. If no reference was opened, say so in the footer (*"Answered from general knowledge — no references consulted"*) — never fake it.

The voice is competent and careful — no "as an AI assistant" hedging.

## How to search this navigator

Every reference is filename-prefixed by its source slug — `<source-slug>-<topic>.md`. To find references for a given source, scan only that source's Catalog section; the prefix discrimination keeps sources visually separated even when filenames are listed together.

A `Tags` column on each catalog row marks references that span multiple sources (`cross-cutting`) or call out unusual entry points. Use tags to triangulate when a question doesn't cleanly belong to one source — a `cross-cutting` row usually links sideways via the reference's `## See also` block.

See [`02-artifact-contract.md`](https://github.com/nick-railsback/skill-engine/blob/711e3144e1ad81b50414667b9b5e3c0363989955/plugin/skill-engine/docs/02-artifact-contract.md) for the filename-prefix-discrimination contract.

## How to follow source links

References pin source PDFs by filename + content-hash + page number (these are `local-path` sources, not git-managed). Follow a page cite by opening that page of the named PDF; the content-hash in each reference's header confirms you are reading the same file the reference was authored against. The reports are point-in-time snapshots — a16z *State of Crypto 2025* is as of Sept 30 2025; *State of DeFi 2025* covers calendar-2025; the CRS primer is March 16 2026; the Lewis analysis is April 7 2026. Treat every figure as "as of" its report's date, not current.

## Cross-source map

These entries name where to start when a question spans more than one of the four sources.

- **"What exists on which chain" / Ethereum-ecosystem questions** → start with `state-of-defi-2025-chains.md` (the deepest per-chain breakdown: Ethereum L1, every major L2, Solana, other L1s, Bitcoin DeFi), then cross-check figures against `state-of-crypto-2025-a16z-crypto-chains-and-infrastructure.md` (a16z's RWA/stablecoin/developer-by-chain tables and the L1-vs-L2 fee chart). Caveat the reader: `r48883-2-congressional-defi-primer.md` (CRS) names **only Ethereum and Bitcoin** and omits L2s and Solana, so do not infer chain coverage from it. The one-line synthesis across both industry reports: **Ethereum L1 leads on stablecoins, RWAs, developers, and settlement security; Solana leads on spot DEX volume; Hyperliquid leads on perps; value is fanning out to app-specific L2s.**
- **DeFi regulation / policy questions (US)** → three sources speak to this from different vantages. Use `r48883-2-congressional-defi-primer.md` for the neutral landscape (agencies, the CLARITY/GENIUS Acts, developer-liability and illicit-finance debates); `ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026-safe-harbor-economics.md` for the *advocacy* economic case for a front-end broker-dealer safe harbor; and the policy section of `state-of-crypto-2025-a16z-crypto-market-overview.md` for industry framing of the same 2025 legislative wins. They agree on the facts (GENIUS enacted, CLARITY passed the House) but differ sharply in posture.
- **Headline figures (TVL, stablecoin supply, fees, RWA) — when two reports disagree** → the CRS primer gives round all-chain figures (TVL ~$98B, Mar 2026); *State of DeFi 2025* and a16z give granular, source-attributed numbers. Prefer the industry reports for precision and always carry the as-of date, because the snapshots differ by up to ~6 months.
- **"Where is DeFi heading" / opportunity / outlook / growth-vector questions** → start with `state-of-defi-2025-outlook-and-opportunities.md`, the synthesis layer that distills both industry reports' forward-looking analysis (2026 pressure-tests, RWA/yield/restaking/perps growth vectors, the revenue-capture map, a16z's nine predictions) with the gating risks. It is explicitly framed as the reports' analysis, **not investment advice** — keep that framing in any answer, and weigh the Lewis safe-harbor source as advocacy when citing regulatory tailwinds.

<!-- Add entries as new cross-source patterns emerge from real usage; the DISCOVER pipeline does not auto-generate these. -->

## Instructions to Claude

When loading a reference file, the path syntax depends on the platform:

* **Claude Code**: `Read $CLAUDE_SKILL_DIR/references/<source-slug>-<topic>.md`
* **Claude Desktop**: `Read references/<source-slug>-<topic>.md`

Loading rules:

* Load one reference at a time unless the Cross-source map says to load both.
* Pick the catalog section by source first; topic second.
* If the primary reference doesn't fully answer the question, follow any page-number pointers it provides into the source PDF for deeper detail.
* Do not eagerly load companion files; only follow companion links when the primary reference says to.
* If the user's question is clearly out of scope for any registered source, don't invoke this skill at all.

## Catalog

### Catalog: state-of-defi-2025

DLNews / DeFiLlama / DL Research, *State of DeFi 2025* (121 pp, calendar-year 2025). The most detailed source in the corpus.

| Reference | Description | Tags |
|---|---|---|
| [state-of-defi-2025-market-overview](references/state-of-defi-2025-market-overview.md) | 2025 thesis ("maturation through specialization"), the revenue/fee concentration map (Tether+Circle ~75% of revenue), digital-asset treasuries, DAO treasuries, and the 2026 outlook. | |
| [state-of-defi-2025-sectors](references/state-of-defi-2025-sectors.md) | Per-primitive deep dive: stablecoins, DEXs/aggregators, perps, lending (Aave/Morpho/Maple), liquid staking & restaking (Lido/EigenLayer/Babylon), RWAs, yield (Pendle), issuance rails, MEV & oracles. | |
| [state-of-defi-2025-chains](references/state-of-defi-2025-chains.md) | Chain-by-chain liquidity topography — Ethereum L1, each major L2 (Arbitrum, Base, Optimism, zkSync, …), Solana, other L1s (Hyperliquid, Tron, BNB, Sui, …), and Bitcoin DeFi, with per-metric tables. | `cross-cutting` |
| [state-of-defi-2025-outlook-and-opportunities](references/state-of-defi-2025-outlook-and-opportunities.md) | Forward-looking synthesis across both industry reports: the 2026 pressure-tests, growth vectors (RWAs, yield-bearing stablecoins, perps/execution, L2 lending), where revenue is captured, a16z's nine predictions, and the risks gating each — framed as the reports' analysis, not investment advice. | `cross-cutting` |

### Catalog: state-of-crypto-2025-a16z-crypto

a16z crypto, *State of Crypto 2025* (54 pp, as of Sept 30 2025).

| Reference | Description | Tags |
|---|---|---|
| [state-of-crypto-2025-a16z-crypto-market-overview](references/state-of-crypto-2025-a16z-crypto-market-overview.md) | Market size & users, 2025 institutional-adoption theme (ETFs, treasury cos), stablecoins gone mainstream ($46T volume), onchain app categories, US regulation, and nine forward predictions. | |
| [state-of-crypto-2025-a16z-crypto-chains-and-infrastructure](references/state-of-crypto-2025-a16z-crypto-chains-and-infrastructure.md) | Throughput (~3,400 TPS), the Ethereum L1-vs-L2 fee-compression chart ($24 → <1¢), and per-chain tables for builder interest, stablecoins, RWAs, bridges, and network-revenue share. | `cross-cutting` |

### Catalog: r48883-2

Congressional Research Service, *An Overview of Decentralized Finance* (R48883 v2, Mar 16 2026).

| Reference | Description | Tags |
|---|---|---|
| [r48883-2-congressional-defi-primer](references/r48883-2-congressional-defi-primer.md) | Neutral congressional primer: DeFi building blocks and applications, differences from TradFi, the (unsettled) US regulatory landscape, the CLARITY/GENIUS Acts, illicit finance, and policy options. Names only Ethereum and Bitcoin. | |

### Catalog: ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026

Craig M. Lewis (Vanderbilt; a16z-funded), *Economic Analysis of the DeFi Front-End Safe Harbor* (42 pp, Apr 7 2026).

| Reference | Description | Tags |
|---|---|---|
| [ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026-safe-harbor-economics](references/ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026-safe-harbor-economics.md) | Cost-benefit case for exempting non-custodial DeFi front-ends from broker-dealer registration: protocol-vs-app distinction, the four eligibility criteria, claimed benefits/costs, the DINO carve-out, and Ethereum L2 fee data. | |

<!-- Each Catalog header binds to one source entry in research/source-paths.json (by id). Self-audit enforces bijection — every reference primary appears in exactly one catalog row; every catalog row points at an existing primary. -->

## Markdown style for generated references

Reference files use **soft wrapping**: one paragraph per line, no hard line breaks at fixed column widths. Editors and rendered Markdown reflow at viewport width. Do not insert manual line breaks within a paragraph to keep lines under ~80 columns — that produces mid-sentence breaks in rendered output and makes diffs noisier. Code blocks, tables, bullet lists, and headings follow their own rules; this directive applies to prose paragraphs only.

## Progressive disclosure

References prioritize curated insight over re-specifying upstream sources:

* **Gotchas, cross-system patterns, and "why" context** are kept in the reference (curation value).
* **Exact schemas, figures, and per-chain tables** are summarized in the reference and pinned to a PDF page number for verification.

When a reference includes a page-number pointer, follow it only when the reference's own summary didn't cover the question. The contextualizer is optimized for the common case; the source PDF is the long tail.

## Optional SKILL.json sibling

This navigator MAY ship an optional `SKILL.json` sibling alongside this `SKILL.md` for machine-readable consumers (opt-in additive — contextualizers without it pass verification unchanged). When present, per-source `## Catalog: <source-slug>` rows above, SKILL.json `catalog[]` entries, and `references/<source-slug>-*.md` files must stay in three-way correspondence. Entries carrying `"draft": true` in SKILL.json are excluded from the trijection and surface as a one-line summary at verify time. The `skill-json-trijection` named check fires only when SKILL.json is present; absence is a silent-skip pass.

Full schema: see [`02-artifact-contract.md`](https://github.com/nick-railsback/skill-engine/blob/711e3144e1ad81b50414667b9b5e3c0363989955/plugin/skill-engine/docs/02-artifact-contract.md) §"SKILL.json".
