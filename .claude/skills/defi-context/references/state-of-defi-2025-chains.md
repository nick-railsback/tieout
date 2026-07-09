# State of DeFi 2025 — chain-by-chain liquidity topography

**Source:** `state-of-defi-2025.pdf` — local-path PDF (121 pages), content-hash `549dd420`. Citations point to the report's printed page numbers (e.g. p.78). There is no upstream URL to SHA-pin — the content-hash is the verification anchor. This is the deepest chain breakdown in the corpus; companions are `state-of-defi-2025-market-overview.md` and `state-of-defi-2025-sectors.md`. **Tagged cross-cutting** — primary input to the navigator's "what exists on which chain" Cross-source map. All "X → Y" figures are 2024 baseline → 2025 snapshot per the report's tables.

## Contents

- How to read this (the per-chain tables)
- Ethereum L1 — the DeFi-native monetary base
- Ethereum L2s — individually and as a category
- Solana — the high-throughput trading chain
- Other L1s (Hyperliquid, Tron, BNB, Avalanche, Sui, Aptos, Plasma, Polygon)
- Bitcoin DeFi

## How to read this (the per-chain tables)

The report's "Liquidity topography" section (p.66-84) plus chain tables embedded in the stablecoin/trading/lending sections give per-chain figures across five metrics: stablecoin supply (p.13-14, p.74), lending TVL and fees (p.71), perps volume (p.72), spot DEX volume (p.73), and L2 Total Value Secured (TVS, p.78). The one-line summary for the Ethereum question: **Ethereum L1 still leads on stablecoins, RWAs, security/settlement, and developers; Solana leads on spot DEX volume; Hyperliquid leads on perps; and value is spreading to app-specific L2s** — "compression at the core, expansion at the edge" (p.78).

## Ethereum L1 — the DeFi-native monetary base

Ethereum L1 remains the dominant DeFi-native settlement layer. **Stablecoins:** ~**55% of total supply**, +$50B new issuance in 2025; Ethereum + Tron together hold **81% of all circulating stablecoins**; average stablecoin supply $82.5B → $135.6B (#1 by a wide margin) (p.13-14, p.74). **Lending:** TVL **$28.28B → $39.91B** (chain share 17.4% → 21.5%), fees $566.18M → $1.01B (p.71). **Perps:** $410.0B → $323.7B — slipping from #2 to #6 as execution-specialized venues took share (p.72). **Spot DEX:** $669.4B → $902.3B (#2, behind Solana) (p.73). As a **data-availability and security anchor**, Ethereum secures **$38.67B value / $73.48B economic security across 54 chains** (Base, Arbitrum One, OP Mainnet, Starknet) — "an order of magnitude more than all competitors combined" (p.79-80). Dencun + Pectra cut its average transaction cost ~86% (p.29).

## Ethereum L2s — individually and as a category

2024 was extreme L2 concentration (Arbitrum + Base alone >$33B TVS); 2025 brought "compression at the core, expansion at the edge" as app-specific chains entered the top tier (p.78). L2 Total Value Secured, 2024 → 2025 (p.78):

- **Arbitrum:** $18.49B → **$17.1B (#1 TVS)**. Lending TVL $1.43B → $1.71B (share fell 25.1% → 18.0%); perps $309.5B → $182.5B; spot DEX $253.4B → $239.6B; stablecoins $3.8B → $2.9B (declined) (p.71-74). Treasury ~97%+ ARB-denominated (p.112).
- **Base:** $14.73B → **$12.64B (#2 TVS)** — the standout lending story: **TVL $1.01B → $3.11B, share 24.4% → 48.0%, fees $13.51M → $69.50M** (p.71); spot DEX $196.7B → $381.2B (#4); stablecoins $2.5B → $4.2B (grew); became cash-flow positive post-Dencun (p.29-30, p.73-74). The "Base and Ink model" of exchange/fintech-launched L2s is cited as the template (p.78).
- **Optimism:** $7.21B → **$2.39B** — sharp contraction as value migrated into OP-stack execution environments; OP Mainnet exited the stablecoin top-10 (p.74, p.78). Treasury ~97.5% OP (p.112).
- **zkSync Era:** $0.76B → $0.48B TVS; perps $90.1B (2024 #8) dropped out of the 2025 top-10 (p.72, p.78).
- **Linea** $0.80B → $0.797B; **Starknet** $0.92B → $0.791B; **Scroll** $0.58B → out of top-10 (p.78).
- **Blast:** incentive-driven — perps $203.4B and spot $133.8B (both 2024 #6) collapsed out of the 2025 top-10 as incentives faded (p.72-73).
- **New app-specific L2s entering the top tier (2025):** **Lighter $1.37B (#4)**, **Ink $0.432B (#8)**, **Katana $0.416B (#9)**, **Unichain $0.30B (#10)** (Unichain spot DEX $71.0B, #9) (p.73, p.78). Dencun's cheaper blobspace (March 2024) is what moved Optimism and Base from structural losses to profitability (p.30).

## Solana — the high-throughput trading chain

Solana is the trading-volume leader. **Spot DEX: $693.6B → $1,471.9B (#1, more than doubled)**, extending its lead over Ethereum and peaking above 70% of global DEX volume early in 2025 before settling to a ~20-35% baseline (p.73, p.76-77). **Perps:** $249.5B → $423.7B (#5) — the only general-purpose chain remaining top-5 (p.72). **Lending:** TVL $2.54B → $3.54B (share 13.8% → 16.0%, fees $74.13M → $106.33M) — the only chain where both lending TVL and share rose (p.71). **Stablecoins:** average balance $3.3B → $12.0B (5th → 3rd place, +170-263%) (p.13, p.74). Base-layer scale: total transactions **13.16B → 21.01B (+59.6%)**, max daily fees $13.86M → $28.89M (p.75); Solana's share of total DeFi TVL rose from a 5.08% to a 7.73% average with a structurally higher floor (p.75). Named Solana protocols: Pump.fun, Raydium, PumpSwap, Meteora, Jupiter, Kamino, MarginFi, Jito, Sanctum, Marinade, Drift (p.13, p.45, p.56, p.76).

## Other L1s (Hyperliquid, Tron, BNB, Avalanche, Sui, Aptos, Plasma, Polygon)

- **Hyperliquid (L1):** the breakout execution chain — **perps $564.7B → $2,763.3B (#1, >4x)**; spot DEX $160.6B (#6 in its first full year, surpassing Arbitrum and Sui); stablecoin supply $1.9B → $3.8B with USDC the dominant margin asset (p.13, p.72-74). Its perps share fell from ~75% to ~44% as competitors scaled (p.43).
- **Tron:** the "global remittance chain" — stablecoin supply +34% (+$25B), average supply $56.9B → $73.5B (#2), driven by CEX settlement and offshore payments rather than DeFi; JustLend lending share fell 15.3% → 6.5% (p.13, p.53, p.74).
- **BNB Chain (BSC):** spot DEX $262.4B → $670.8B (#3); perps entered the top-10 at $114.0B (#9); stablecoin market cap $6.87B → $14.46B (+110%); Four.meme + Binance Alpha catalysed a memecoin boom; MEV "enshrined" via a builder framework (p.13, p.72-74, p.88-89).
- **Avalanche:** lending TVL $932.8M → $971.4M (share 47.6% → 36.0%); spot DEX $47.5B → $88.1B (#8); stablecoins declined slightly (p.71-74).
- **Sui:** the breakout new execution environment — **spot DEX $42.9B → $136.9B (#7, tripled)**, "the only new execution environment to achieve sustained material spot liquidity in 2025"; Suilend entered the lending fee top-10 (p.54, p.73).
- **Aptos:** lending TVL shrank $735.1M → $395.8M but fees rose $6.20M → $13.44M (p.71).
- **Plasma:** a stablecoin-first L1 launched Sept 2025, reaching ~$1.87-2B circulating supply within months (entering the stablecoin top-10); peers building stablecoin-first chains include Stable, Arc (Circle), and Tempo (Stripe) (p.13, p.17, p.74).
- **Polygon:** stablecoin market cap $1.64B → $3.07B (+87%); lending TVL declined $423.0M → $280.4M; spot DEX ~flat $53.7B (#10) (p.13, p.71, p.73).

## Bitcoin DeFi

Bitcoin DeFi grew in real terms: total TVL **$9.88B → $26.83B**, or **159,286 → 242,501 BTC (+52%)** in coin terms (p.81). But BTC mostly *transits* its own L2s/sidechains rather than staying: Rootstock $220.2M → $153.0M (#1), **CORE $803.5M → $45.9M (-94%)**, **Bitlayer $358.8M → $6.4M (-98%)**, with new entrants Botanix, Hemi, and Rollux small (p.82). The real BTC liquidity sits in wrappers/bridges: **WBTC $12.27B → $11.14B (#1)**, Coinbase Bridge $6.46B (#2), Binance Bitcoin $6.13B (#3), and **Babylon Protocol $5.28B → $5.01B** as the BTC-restaking anchor; exchange-backed bridges are gaining share (p.82). The featured **Hemi** uses a "tunneling" system that avoids multisig bridge custody (p.83-84).

## See also

- `state-of-crypto-2025-a16z-crypto-chains-and-infrastructure.md` — a16z's per-chain RWA/stablecoin/developer tables and the Ethereum L1-vs-L2 fee-compression chart, for cross-checking.
- `state-of-defi-2025-sectors.md` — which protocols lead each sector (the chain each runs on is named here).
- `r48883-2-congressional-defi-primer.md` — note the contrast: the CRS primer covers only Ethereum and Bitcoin, omitting L2s and Solana entirely.
