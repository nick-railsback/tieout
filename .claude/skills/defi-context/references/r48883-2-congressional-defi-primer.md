# CRS primer: An Overview of Decentralized Finance (R48883, 2026)

**Source:** `R48883.2.pdf` — local-path PDF, content-hash `d63cc4dc`. Citations point to the report's printed page numbers (e.g. p.5); open the PDF to that page to verify. There is no upstream URL to SHA-pin — the content-hash is the verification anchor.

## Contents

- What this document is
- DeFi building blocks and applications (the primer)
- Chain-specific content (Ethereum dominance; what's *not* covered)
- Regulatory landscape and policy options for Congress
- Illicit-finance section
- Key figures and definitions

## What this document is

**Congressional Research Service (CRS) Report R48883, Version 2**, "An Overview of Decentralized Finance (Defi)," by **Paul Tierno** (Analyst in Financial Economics), dated **March 16, 2026**, prepared for Members and Committees of Congress (cover; p.22-23). It is a nonpartisan primer that walks Congress through (1) DeFi's building blocks, (2) the services DeFi offers, (3) how DeFi diverges from traditional finance, and (4) DeFi's unsettled regulatory treatment and the policy issues facing Congress (Introduction, p.1; Summary). Its framing: DeFi roughly mimics traditional finance but is far smaller, is permissionless, and substitutes collateral and technology for credit scores, underwriting, and intermediaries — features that create real compliance and enforcement challenges (Summary; p.10-13).

## DeFi building blocks and applications (the primer)

The report defines DeFi as the "use of cryptocurrency and certain programs that create a financial system with little, if any, use for intermediaries" on public, permissionless blockchains (p.1), distinguishing **on-chain** activity (self-custody/"unhosted" wallets) from **off-chain** activity by centralized intermediaries, which is "generally not considered defi" (p.2). Building blocks: **cryptocurrency**, **smart contracts** ("a program... that can self-execute when a participant... meets some predetermined set of criteria," usually immutable once published) (p.2-3, p.13), and **oracles** linking off-chain and on-chain data (p.4). It catalogs the main DeFi applications: validating/staking (incl. liquid-staking receipt tokens), mixers, decentralized exchanges (AMMs with the constant-product `x·y=k` formula, liquidity providers/pools), lending protocols (over-collateralization, "keepers" that liquidate undercollateralized positions), and yield farming with LP tokens (p.6-10). It presents competing "DeFi stack" layer models from one classification and from the CFTC (settlement/application/interface vs. an expanded hardware→governance stack) (p.5).

## Chain-specific content (Ethereum dominance; what's *not* covered)

For the "what exists on which chain" question, this report is the most **Ethereum-centric and the least multichain** of the corpus. It names only two specific chains — **Bitcoin** (first cryptocurrency, 2008/2009, originally an alternative payment system to disintermediate banks, p.2) and **Ethereum** — and treats DeFi as otherwise chain-agnostic ("TVL... across all blockchains"). Ethereum is "the most popular blockchain on which various smart contracts operate and financial services take place" (p.4) and a "hub for defi activity" (p.2). **Ethereum protocols hold the most TVL — ~$56B of the ~$98B all-chain total as of March 2026** (p.5). Token standards are tied explicitly to Ethereum: **ERC-20** (fungible) and **ERC-721** (non-fungible) (p.5). The staking example uses **32 ether (>$64,000 as of March 2026)** on the Ethereum platform (p.6); the oracle example deposits **USDC** into an "Ethereum-based smart contract" (p.4); **Uniswap "originated on the Ethereum blockchain"** (p.9). **No Ethereum L2s (Base, Arbitrum, Optimism), no Solana, and no other alternative L1s are mentioned anywhere** — a notable gap versus the two industry reports in this corpus, which cover L2s and Solana in depth. If a question needs L2/Solana/multichain detail, route to `state-of-defi-2025-chains.md` or `state-of-crypto-2025-a16z-crypto-chains-and-infrastructure.md` instead.

## Regulatory landscape and policy options for Congress

DeFi's regulatory treatment is "unsettled," and the report stresses that posture shifted markedly from the Biden to the second Trump Administration — agencies rescinded guidance and dropped enforcement, so whether DeFi is regulated "appears to be largely a matter of custom or practice that may continue to shift absent clarifying legislation" (p.11, p.14). Agencies and actions covered: **FinCEN/Treasury** BSA/AML guidance (2013, May 2019) treating crypto money transmitters as MSBs "regardless of... label," plus a Nov. 2023 proposal to sanction specific blockchain nodes (p.7, p.11, p.17-18); **OFAC** sanctioning Tornado Cash (Aug. 2022) and delisting it (March 2025), raising whether a self-executing smart contract can even be sanctioned (p.18); **SEC** Wells Notice to Uniswap (April 2024), investigation closed (Feb. 2025) (p.14-15); **CFTC** advisory-committee definitional work (p.1, p.5); and the **DOJ** Blanche memo (April 2025), "Ending Regulation By Prosecution," deprioritizing BSA enforcement (p.11, p.18).

Legislation discussed includes the enacted **GENIUS Act** (P.L. 119-27, July 2025, stablecoin regime requiring issuers to "block, freeze, and reject" transactions) (p.3, p.20-21) and the **CLARITY Act** (H.R. 3633), under which "developing, publishing... or otherwise distributing a blockchain system or a decentralized finance trading protocol" would **not** be subject to the act — meaning the market-structure bills mostly would *not* apply to DeFi (Summary, p.16). Related bills: the Blockchain Regulatory Certainty Act (H.R. 3533), S. 3755 §207, and a January 2026 Senate Banking draft exempting "non-controlling developers/providers" — over which Senate Judiciary leaders warned of a "significant enforcement gap" (p.16, p.19). Policy options framed for Congress: oversight vs. legislation; dedicated DeFi law vs. folding into broader crypto bills; "same-risk-same-regulation" activities-based approaches vs. entity-based ones; and "New Solutions" like screening sanctioned addresses and zero-knowledge proofs of non-sanctioned status (p.11, p.14, p.20). It also flags **First Amendment** feasibility questions (code as speech), citing *Van Loon v. Dep't of Treasury* and *Carman v. Yellen* (p.22).

## Illicit-finance section

The report devotes a section to DeFi and illicit finance (p.17-20), noting estimates range widely — FinCEN's 2020 SARs figure of ~$119B / 11.9% of U.S. crypto activity at the high end (p.20), versus analytics-firm estimates "as low as 0.15%" of on-chain activity (likely to surpass $51B in absolute terms) (p.20). It quotes Treasury's 2024 NMLRA that virtual-asset misuse "continues to remain far below that of fiat currency" while still observed in ransomware, scams, and trafficking (p.20), and maps the "Grey Area" at the centralized-to-decentralized boundary where AML/KYC gaps concentrate (p.19).

## Key figures and definitions

- **TVL ~$98B across all blockchains (March 2026)**, down from a ~$180B peak in late 2021 (p.5); likened to the market cap of a single large public company against a ~$2.49T crypto market cap and ~$127T global equity market cap (p.21).
- **Uniswap:** largest DEX, ~$52.5B 30-day volume, ~$3.1B TVL, 1,000+ coins and pairs (p.8-9). **Aave:** largest lending protocol, ~$27B TVL of a ~$54B lending sector (p.9-10). **Tornado Cash:** the sanctioned/delisted mixer (p.18). **USDC:** stablecoin used as the collateral/oracle example (p.4).
- Consensus mechanisms (PoW vs. PoS with slashing) (p.6); embedded text boxes: "Centralization in a Defi World" (p.3), "Defi Layers" (p.5), "Dynamic Pricing" (p.9).

*Document structure:* Introduction (p.1); Defining Defi → building blocks, applications, differences with TradFi (p.1-13); Regulatory Policy Issues → arbitrage/innovation, illicit finance, new solutions, feasibility/legality (p.14-22); Author Information & Disclaimer (p.22-23).

## See also

- `ctf-written-craig-m-lewis-economic-analysis-defi-04-07-2026-safe-harbor-economics.md` — an advocacy economic analysis arguing the front-end safe-harbor case the CRS report describes neutrally.
- `state-of-defi-2025-market-overview.md` — industry data on the same TVL/fee/revenue figures the CRS primer summarizes at a high level.
