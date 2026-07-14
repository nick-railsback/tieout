# State of DeFi 2025 — market overview, revenue map & treasuries

**Source:** `state-of-defi-2025.pdf` — local-path PDF (121 pages), content-hash `549dd420`. Citations point to the report's printed page numbers (e.g. p.22). There is no upstream URL to SHA-pin — the content-hash is the verification anchor. This is one of three references for this report; see also `state-of-defi-2025-sectors.md` (per-primitive deep dives) and `state-of-defi-2025-chains.md` (chain-by-chain).

## Contents

- What this document is
- The 2025 thesis: maturation through specialization
- Capital and revenue map: who earned, who faded
- Infrastructure costs collapsing
- Digital asset treasuries: boom to reckoning
- Governance, token design and DAO treasuries
- Outlook for 2026

## What this document is

**State of DeFi 2025**, co-produced by **DLNews, DeFiLlama, and DL Research** (PDF created Dec 23, 2025; covers calendar-year 2025) (p.1, p.24). Data sources throughout: DeFiLlama, Dune, rwa.xyz, Coingecko, Visa Onchain, L2Beat, Jito, Stablewatch. Most tables compare a Jan 1 / Dec 31 2024 baseline against a late-Nov/early-Dec 2025 snapshot. Thesis: in 2025 DeFi moved "from a cycle-defined speculative arena" to "a durable financial system with recognisable primitives, maturing market structure, and increasingly institutional-grade infrastructure," but growth was uneven — a few sectors reached "escape velocity" while others were repriced once incentives faded (p.7).

## The 2025 thesis: maturation through specialization

The report's organizing idea is **"maturation through specialization"** (p.7): stablecoins became the monetary base; trading converged into one continuous stack (issuance → spot → perps → prediction markets); credit and yield became fixed-income-like on stablecoin and RWA collateral; execution improved via private routing even as market power concentrated; and treasury capacity became a decisive competitive separator (p.7-10). "By the end of 2025, DeFi looked less like a single market and more like a layered financial system" (p.10). The closing judgment: winners were "not simply the protocols with the most users or the most TVL, but those with durable execution, credible risk frameworks, and clear economic models that still function when incentives fade" (p.10).

## Capital and revenue map: who earned, who faded

Revenue is strikingly concentrated. The **top 10 protocols earned ~60% of all fees; the top 20, ~80%** (p.22). At the issuer level, **Tether captured ~54% of all DeFi revenue and Circle ~18% — together ~75%**, leaving ~25% to everyone else (p.22). Perps venues (Hyperliquid, EdgeX, Lighter, Axiom) made up ~7.5% of industry revenue (p.22). For the full year, users paid **$30.3B in fees → $17.58B protocol revenue → $3.36B to tokenholders** (58% of fees become revenue; 19.1% of revenue reaches holders) (p.113-114), and holder revenue as a share of protocol revenue **tripled from ~5% to ~15%** year over year (p.31). A structural shift: DeFi/finance apps overtook blockchains in fee generation, on track for **$13.1B / 66% of total fees in 2025** (+113% YoY in H1), while blockchains' share fell toward <20% (from 56% in 2021) (p.29).

## Infrastructure costs collapsing

Settlement costs fell sharply on the dominant chain: **Ethereum's average transaction cost dropped ~86% (≈$0.63 → $0.09) while daily transactions grew ~2.7x (64M → 169M)** from H2'21 to H2'25, post-Dencun and Pectra (p.29). Dencun's cheaper blobspace (March 2024) moved Optimism and Base from structural losses to sustained profitability (p.30). Bridge revenue held at a modest $3-5M/month amid intense fee competition (p.28). The per-chain consequences of this cost collapse are detailed in `state-of-defi-2025-chains.md`.

## Digital asset treasuries: boom to reckoning

The digital-asset-treasury (DAT) sector peaked at **>$112B in value across 195 listed companies holding >1M BTC**; July 2025 alone saw 118 companies buy 103,000 BTC (p.101). **ETH treasuries: 68 firms held >$20B in ETH by December** (p.102), with VanEck's Jan van Eck calling ETH "The Wall Street token" because "over half of all stablecoins operate on Ethereum rails" (p.102). The report's outlook treats DATs as entering a "post-flywheel regime" — the model persists but the easy premium-accretive phase is gone, likely compressing into a few credible vehicles (p.103, p.122).

## Governance, token design and DAO treasuries

DAO treasuries are as concentrated as revenue. Across ~360 DAOs holding ~$12.4B, the **top 10 hold 79% and the top 25 hold 92%** (p.110). Largest treasuries: Mantle $3,652.2M (94.2% MNT), Uniswap $2,095.3M (100% UNI), ENS $884.2M, Cardano $764.9M, Optimism Foundation ~$619M (p.110-111). Most are dangerously single-asset (Uniswap 100% UNI; Optimism ~97% OP), with Aave a rare balanced example (52% native / 30% stable / 18% other) (p.112). The token-design theme: more explicit value capture and tighter issuance separate durable protocols from noisy ones (p.110-114).

## Outlook for 2026

"2026 looks less like a new narrative cycle and more like a year where a few concrete pressure tests decide which parts of DeFi are durable" (p.121). The named pressure tests: stablecoins shift from "growth" to "role separation"; execution quality becomes the main trading battleground; credit/yield is judged on "quality of carry, not TVL"; restaking faces an explicit risk-premium test now that EigenLayer slashing is live; market integrity (private routing / solver concentration) draws regulator attention; and treasury discipline widens the execution gap between top DAOs and the rest (p.121-122). Sector-level detail behind each test is in `state-of-defi-2025-sectors.md`.

## See also

- `state-of-defi-2025-sectors.md` — per-primitive deep dives (stablecoins, DEXs/perps, lending, staking/restaking, RWA, yield, MEV/oracles).
- `state-of-defi-2025-chains.md` — chain-by-chain liquidity topography (Ethereum L1, L2s, Solana, other L1s, Bitcoin DeFi).
- `state-of-crypto-2025-a16z-crypto-market-overview.md` — a16z's parallel market/adoption view of the same year.
