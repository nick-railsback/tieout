# State of DeFi 2025 — sectors & primitives deep dive

**Source:** `state-of-defi-2025.pdf` — local-path PDF (121 pages), content-hash `549dd420`. Citations point to the report's printed page numbers (e.g. p.53). There is no upstream URL to SHA-pin — the content-hash is the verification anchor. Companion references: `state-of-defi-2025-market-overview.md` and `state-of-defi-2025-chains.md`. Where a leading protocol's chain matters, it is named inline; the full per-chain tables are in the chains reference.

## Contents

- Stablecoins
- DEXs and aggregators
- Perps and derivatives
- Lending and money markets
- Liquid staking and restaking
- RWAs and tokenised credit
- Yield markets and duration
- Primary issuance rails and prediction markets
- Execution, MEV and oracles

## Stablecoins

Stablecoins became "the monetary base" of DeFi. Total market cap grew **$204B (Jan 2025) → $305B (early Dec 2025), +50%**, with **USDT + USDC ≈ 85% of supply** (p.13). Tracked stablecoins rose from 161 to 214 (51 above $50M; 18 above $1B) (p.13). Settlement volume hit **$52.9T over twelve months** (~double 2024's $27T, itself already above Visa+Mastercard combined) (p.14). Issuer movers, Jan 1 → Nov 27 market cap (p.14): USDT $137.0B → $184.5B; USDC $43.9B → $75.4B (+71.8%); **USDS $1.28B → $5.85B (+358%)**; **PYUSD $0.50B → $3.81B (+666%)**; USD1 (World Liberty) $0 → $2.71B; **BlackRock USDTB $0.09B → $1.34B (+1397%)**; **Ripple RLUSD $0.06B → $1.26B (+2089%)**. Yield-bearing stablecoins grew **$9.5B → >$20B** (yields 2-10%, avg ~5%), led by sUSDe, BUIDL, sUSDS (p.18). Chain-agnostic supply uses Circle's CCTP burn-and-mint and USDT0 via LayerZero (p.17); GENIUS (US) and MiCA (EU) were the key regulatory catalysts (p.16).

## DEXs and aggregators

DEX market structure de-concentrated. Three protocols (Uniswap, Curve, PancakeSwap) were ~75% of DEX volume in 2023, splitting across ~10 venues by 2025, and the aggregator duopoly (Jupiter + 0x ~80%) opened to >10 participants (p.38). **Uniswap dominance fell from ~50% to ~18%** in a year (p.26). Cumulative DEX TVL rose **$6.8T (end 2024) → $11.4T (2025)**, and the DEX share of global spot volume climbed ~4% → ~20%, with the DEX/CEX spot ratio peaking at **37.4% in June 2025** (p.37-38). Intent-based execution surged: **NEAR Intents $3M → >$6B (+200,000%)**, CoW Swap to ~$10B/month, Hyperliquid spot orderbook $12B → $125B (p.40). Rising venues include Meteora, PumpSwap, and Aerodrome (Base) (p.26).

## Perps and derivatives

Perps were the breakout trading sector. Weekly volume rose **~$50B (2024) → $250-300B (2025)**; cumulative volume went **~$4T → >$12T**; the DEX/CEX perps ratio climbed to ~12% (p.42). Open interest tripled **~$30B → ~$90B** (p.43). **Hyperliquid** is the anchor venue, though its perps share fell from ~75% to ~44% as Aster, Lighter/zkLighter, and EdgeX each scaled to ~15-20% of volume and Jupiter held ~10% (p.43). About five protocols account for ~70% of onchain perps volume and ~90% of fees (p.24, p.43). Maturation drivers: hybrid/off-chain-orderbook designs (Vertex, Drift), cross-margin, and unified collateral (p.43-44).

## Lending and money markets

Lending TVL grew **$48.15B → $64.06B (+33%)**, with the top 10 protocols at 89% (p.53). **Aave V3 is "DeFi's default balance sheet"** — share 50.47% → 56.73%, fees $381.98M → $729.60M (p.53-54). **Morpho V1** is #2 (7.30% → 10.67%, fees $44.6M → $164.1M), and **Maple Finance** posted the largest relative gain (0.68% → 4.20%) on institutional credit (p.53). Losers: JustLend (Tron) 15.26% → 6.46%, Compound V3 5.26% → 2.90%, Venus (BNB) 4.40% → 2.78% (p.53). Utilisation leaders: Euler V2 100%, Fluid 93%, Aave V3 66.4% (p.55).

## Liquid staking and restaking

Liquid-staking TVL was roughly flat in dollar terms (**$58.73B → $57.62B**, a decline driven by ETH repricing) (p.56). **Lido** lost real share (top-10 share 64.7% → 53.6%; $32.52B → $25.52B), while **Binance Staked ETH** jumped to 22% ($6.10B → $10.47B) (p.56). Restaking TVL contracted **$23.85B → $18.78B (-21.2%)**; **EigenLayer** holds 66% ($14.91B → $12.12B) with slashing now live, and **Babylon** (BTC restaking) holds ~27% ($5.29B → $4.94B) (p.57-58). The report flags a thin risk premium: median liquid-restaking yield ~2.7% versus ~2.6% for liquid staking — "little to no risk premium" for the added complexity (p.57).

## RWAs and tokenised credit

RWAs were a standout growth sector (p.59-62). **Private credit $9.83B → $18.71B** (Figure dominant but falling 93% → 74% share; Maple $0.27B → $1.53B) (p.59). **Tokenised US Treasuries/MMFs $3.87B → $9.12B (+135%)**, now led by **BlackRock BUIDL ($0.62B → $2.33B, 25% share, #1)**, overtaking Circle USYC (p.60). A new **institutional-funds** category went $0.17B → $2.77B, led by Janus Henderson Anemoy's tokenised AAA CLO fund (JAAA) at $1.01B (p.61). A ~4-5% U.S. fed funds rate underpinned demand all year (p.59).

## Yield markets and duration

Yield-market TVL was **$8.21B (2024) → $8.71B (2025)** (p.63). **Pendle** is the anchor (share 53.85% → 41.20%), with Spark Savings the new #2 ($0 → $1.83B) (p.63). A concentration risk: Pendle collateral shifted heavily to Ethena — **sUSDE is the single largest asset (29.12%), and all Ethena assets are 48.72% of Pendle collateral** (p.64). Median APYs ranged from Pendle ~6.52% to Aura ~17.64% (p.65).

## Primary issuance rails and prediction markets

The report introduces "primary issuance rails" as a new category sustaining ~$100M/month in revenue (p.25, p.45). **Pump.fun** (Solana) ran 15-60k token launches/day with cumulative fees **$285M → $920M**, yet of ~14M tokens only ~150k (1.07%) graduated to Raydium/PumpSwap (p.45-46). Four.meme (BNB) issued 764k tokens, ~10k listed on PancakeSwap (p.46). Prediction markets matured: **Polymarket** peaked at 130k daily users, $70-100M/day, cumulative >$26B; **Kalshi** ran $150-200M/day, cumulative ~$16B (p.47-48).

## Execution, MEV and oracles

Execution quality is the report's "hidden systemic risk" theme. It maps the MEV supply chain across Ethereum, BNB (where MEV is "enshrined" via a builder framework — 48Club and Blockrazor dominate), and Solana (p.86-91), and tracks order-flow routing and fair-access concerns that drew regulator attention (ESMA's July 2025 MEV report; the SEC folding crypto into 2026 exam priorities; the Nov 2025 Peraire-Bueno mistrial) (p.92-99). On oracles, the featured RedStone interview describes low-latency feeds (Bolt, sub-20ms for MegaETH/Monad) and OEV capture via atomic liquidation auctions (Atom), noting "legacy oracles lost >$500M to OEV" (p.34-36).

## See also

- `state-of-defi-2025-chains.md` — which chain each leading protocol above is deployed on, with full per-chain leaderboards.
- `state-of-defi-2025-market-overview.md` — the cross-sector revenue concentration and 2026 outlook.
- `state-of-crypto-2025-a16z-crypto-market-overview.md` — a16z's view of DEX/perps/RWA/stablecoin categories for cross-checking figures.
