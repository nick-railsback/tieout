# Outlook & opportunities — where DeFi is heading (2026)

**Sources (cross-cutting):** primarily `state-of-defi-2025.pdf` (content-hash `549dd420`) and `State-of-Crypto-2025-a16z-crypto.pdf` (content-hash `7adf8fc3`); secondary context from the two policy docs. Citations point to each report's page numbers (e.g. SoD p.121, a16z p.53). There is no upstream URL to SHA-pin — content-hashes are the verification anchor.

> **Framing & honesty note.** This reference synthesizes the **reports' own forward-looking analysis** — it is not investment advice and not a recommendation to buy, sell, or allocate. Every claim is attributed to a report and a page. Two of the four corpus sources are policy/legal, and one (the Lewis analysis) is **a16z-funded advocacy**, so treat directional claims as the authors' framing, not settled fact. All figures are point-in-time snapshots (a16z as-of Sep 30 2025; State of DeFi calendar-2025); "opportunity" here means *where the reports say growth and value-capture are concentrating*, which ages.

## Contents

- The two reports' explicit forward calls
- Growth vectors (where TVL/revenue is compounding)
- Where value is actually captured (the revenue map)
- a16z's nine predictions
- Risks that gate the opportunities
- How to use this with the rest of the corpus

## The two reports' explicit forward calls

*State of DeFi 2025* frames 2026 not as a new narrative cycle but as "a year where a few concrete pressure tests decide which parts of DeFi are durable" (SoD p.121). Its named pressure-tests double as opportunity theses: **stablecoins shift from "growth" to role separation** (payments vs. collateral vs. treasury vs. yield-bearing cash), with non-USD stablecoins expected and reserve income compressing as rates fall (SoD p.19-20, p.121); **execution quality becomes the main trading battleground**, with collateral mobility / cross-chain margining the real scaling constraint and RWA-collateralized perps emerging (SoD p.44, p.121); **credit and yield get judged on "quality of carry, not TVL"** as private-credit spreads compress and tokenised Treasuries settle in as "the base layer of onchain cash collateral" (SoD p.59-60, p.121); and **restaking faces an explicit risk-premium test** now that EigenLayer slashing is live — either AVS fees become meaningful or consolidation accelerates (SoD p.58, p.121). a16z's parallel thesis is that crypto has crossed into mainstream financial infrastructure, with stablecoins, RWAs, and institutional adoption as the load-bearing growth stories (a16z p.46-49, p.52-53).

## Growth vectors (where TVL/revenue is compounding)

The fastest-compounding sectors in the 2025 data — the report-grounded "where it's growing" list:

- **Tokenised RWAs.** Private credit nearly doubled ($9.83B → $18.71B); tokenised US Treasuries/MMFs grew +135% ($3.87B → $9.12B) with **BlackRock BUIDL** taking the #1 slot; and a brand-new institutional-funds category went $0.17B → $2.77B (SoD p.59-61). a16z sizes onchain RWAs at ~$30B and names it a 2026 wave (a16z p.27, p.53). The macro tailwind: a ~4-5% US fed-funds rate underpinned tokenised-Treasury demand all year (SoD p.59).
- **Yield-bearing stablecoins.** Grew $9.5B → >$20B (yields 2-10%, avg ~5%) and are flagged the "segment to watch"; total stablecoin supply $204B → $305B (+50%), which Citi projects reaching **$1.6-3.7T by 2030** (SoD p.18-20, a16z p.21, p.23).
- **Perps & execution venues.** Perps weekly volume rose ~$50B → $250-300B; **Hyperliquid** is the breakout (perps volume >4x to $2.76T), and intent-based execution exploded — NEAR Intents +200,000% to >$6B, CoW Swap to ~$10B/month (SoD p.42-43, p.40).
- **L2 lending on exchange-launched chains.** **Base** lending TVL tripled $1.01B → $3.11B (share 24% → 48%) and turned cash-flow positive post-Dencun — the "Base and Ink model" the report calls the template (SoD p.71, p.30, p.78).

## Where value is actually captured (the revenue map)

The opportunity-relevant counterpoint: revenue is brutally concentrated. The **top 10 protocols earn ~60% of all fees; the top 20, ~80%**, and **Tether (~54%) + Circle (~18%) alone take ~75% of all DeFi revenue** (SoD p.22). Holder revenue as a share of protocol revenue tripled (~5% → ~15%), and "fee switch" value-capture is a named 2026 theme in both reports (SoD p.31, p.113-114; a16z p.49, p.53). The read-through: durable value accrues to issuers (stablecoins), the leading money market (Aave V3, "DeFi's default balance sheet"), and execution-first venues (Hyperliquid) — not to the long tail (SoD p.22, p.53-54).

## a16z's nine predictions

a16z's closing forward calls (a16z p.53): (1) market-structure legislation becomes a top policy priority; (2) stablecoin adoption accelerates, strengthening the USD; (3) crypto×AI addresses internet-scale challenges; (4) TradFi/fintechs double down on crypto; (5) throughput approaches the largest internet services; (6) a new RWA wave comes onchain; (7) more talent flows in; (8) more tokens generate revenue via fee switches; (9) new consumer products onboard the next user wave. Several echo *State of DeFi*'s pressure-tests (stablecoin role-separation ≈ #2, RWA wave ≈ #6, fee-switch value capture ≈ #8), so where the two independent reports agree is the higher-confidence signal.

## Risks that gate the opportunities

The reports are explicit that each growth vector carries a paired risk: **concentration** (Pendle's collateral is 48.7% Ethena-linked; restaking is 66% EigenLayer; DAO treasuries are 79% top-10 and mostly single-asset) (SoD p.64, p.57, p.110-112); **thin risk premia** (median liquid-restaking yield ~2.7% barely above ~2.6% liquid staking) (SoD p.57); **market-integrity / MEV** drawing regulator attention (ESMA's July 2025 MEV report; the SEC folding crypto into 2026 exam priorities) (SoD p.92-99); and the **unsettled US regulatory perimeter** — the CLARITY Act largely would *not* apply to DeFi and a developer-liability "enforcement gap" is contested (see `r48883-2-congressional-defi-primer.md`). Treat the safe-harbor case in `ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026-safe-harbor-economics.md` as advocacy when weighing regulatory tailwinds.

## How to use this with the rest of the corpus

This reference is the synthesis layer; the detail lives in the per-report references. For the numbers behind a vector, open `state-of-defi-2025-sectors.md` (sector metrics) or `state-of-defi-2025-market-overview.md` (revenue map, treasuries); for the macro/adoption framing, `state-of-crypto-2025-a16z-crypto-market-overview.md`; for which chain a vector is concentrating on, `state-of-defi-2025-chains.md`; for the regulatory gating, the CRS and Lewis references.

## See also

- `state-of-defi-2025-market-overview.md` — the revenue-concentration map and 2026 outlook this reference distills.
- `state-of-defi-2025-sectors.md` — per-sector metrics behind each growth vector.
- `state-of-crypto-2025-a16z-crypto-market-overview.md` — a16z's nine predictions in full context.
- `r48883-2-congressional-defi-primer.md` — the regulatory perimeter that gates these opportunities.
