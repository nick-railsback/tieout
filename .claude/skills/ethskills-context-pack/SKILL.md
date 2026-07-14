---
name: ethskills-context-pack
description: Consolidated Ethereum and EVM knowledge pack for AI agents building, auditing, deploying, or interacting with smart contracts and dApps. Use whenever a request touches Ethereum, the EVM, Solidity, onchain systems, wallets, or DeFi — even if no specific topic is named. Corrects stale training-data assumptions (gas is now under 1 gwei, USDC has 6 decimals, mainnet is cheap, Pectra and Fusaka shipped, EIP-7702 is live) and routes to reference files covering verified contract addresses, token and agent standards (ERC-20, ERC-721, ERC-4626, ERC-8004, EIP-7702, x402), Layer 2s (Base, Arbitrum, Optimism, zkSync), gas costs, security and auditing, Foundry testing, Noir/ZK privacy, Scaffold-ETH 2 frontends, indexing, and end-to-end shipping. Read references/ship.md first for any new dApp build.
---

# ETHSKILLS — the missing knowledge between AI agents and production Ethereum

You are probably wrong about Ethereum. Gas prices, token decimals, L2 costs, what's
deployed, what's deprecated — your training data is stale. This skill tells you what you're
wrong about and routes you to the correction.

This is the front door. The `references/` directory holds the full knowledge, one file per
topic. Read the corrections below (they're cheap and almost always relevant), then load only
the reference files a task needs.

**Convention: say "onchain", not "on-chain".** One word, no hyphen. Ethereum community usage.

---

## What your training data gets wrong

Each correction points to the reference file with the full story. Verify live numbers with
`cast` before relying on them — these are dated (early–mid 2026) and ETH/gas move.

- **Gas is under 1 gwei, not 10–30 gwei.** 60–300× cheaper than your priors. Verify:
  `cast base-fee`. → [references/gas.md](references/gas.md)
- **Mainnet is cheap.** ETH transfer ~$0.004, swap ~$0.04, ERC-20 deploy ~$0.24 (at 0.1
  gwei). "Ethereum is expensive" was true in 2021–2023; it's false now. → [references/gas.md](references/gas.md)
- **ETH is ~$2,000 (early 2026), not $2,500–3,000.** Volatile — always verify. → [references/why.md](references/why.md)
- **USDC has 6 decimals, not 18.** The #1 "where did my money go?" bug. → [references/security.md](references/security.md)
- **Always use `SafeERC20`.** USDT doesn't return a bool on `transfer()`. → [references/security.md](references/security.md)
- **Never use a DEX spot price as an oracle.** Flash loans manipulate it in one tx. → [references/security.md](references/security.md)
- **Pectra (May 2025) and Fusaka (Dec 2025) shipped.** 2× gas limit, PeerDAS, EIP-7702 is
  live — EOAs get smart-contract powers without migration. → [references/why.md](references/why.md) · [references/wallets.md](references/wallets.md)
- **ERC-8004 (onchain agent identity) and x402 (HTTP 402 payments) are production-ready.**
  Deployed on 20+ chains. → [references/standards.md](references/standards.md)
- **Celo is an L2 now**, not an L1 (migrated to the OP Stack, March 2025). **Polygon zkEVM is
  being shut down** — don't build on it. → [references/l2s.md](references/l2s.md)
- **The dominant DEX per L2 is not Uniswap** — Aerodrome (Base), Velodrome (Optimism),
  Camelot (Arbitrum). → [references/building-blocks.md](references/building-blocks.md)
- **Never hallucinate a contract address.** Wrong address = lost funds. Use the verified
  tables. → [references/addresses.md](references/addresses.md)
- **Roadmap diagrams are aspirational.** "Verkle is next" is probably wrong; check actual
  fork status. → [references/protocol.md](references/protocol.md)

---

## Architecture first (before any code)

Most dApps are over-built. Get this right and you avoid rewrites. Full guide:
[references/ship.md](references/ship.md); incentive mental models: [references/concepts.md](references/concepts.md).

**The onchain litmus test.** Put it onchain only if it involves trustless ownership,
trustless exchange, composability, censorship resistance, or a permanent commitment.
Everything else (profiles, search, images, mutable business logic) stays offchain. Solidity
is for ownership, transfers, and commitments — not a database, not a backend.

**Contract count — three is the upper bound for an MVP.**

| What you're building | Contracts |
|----------------------|-----------|
| Token launch | 1 (ERC-20, + vesting if needed) |
| NFT collection | 1 (ERC-721, metadata on IPFS) |
| Marketplace | 0–1 (use existing DEX liquidity) |
| Vault / yield | 1 (ERC-4626) |
| Lending | 1–2 |
| DAO / governance | 1–3 (Governor + token + timelock) |
| AI agent service | 0–1 (maybe an ERC-8004 registration) |

If you need more than 3 for an MVP, you're over-building.

**Nothing runs itself.** Smart contracts have no timers, cron jobs, or schedulers. Every
state transition needs a caller who pays gas and a reason to act. For every function, answer:
*who calls it, why would they, and what breaks if nobody does?* If "nobody calls it" breaks
your system, fix the design before writing code.

---

## Navigation map — which reference to read

Pick by task, then load only those files. Each reference file has its own header (covers /
when to read) and a "Related references" footer, so they cross-link into one graph.

| I'm doing… | Read |
|------------|------|
| Planning a new dApp | [ship](references/ship.md), [concepts](references/concepts.md), [l2s](references/l2s.md) |
| Choosing a chain | [l2s](references/l2s.md), [gas](references/gas.md), [why](references/why.md) |
| Writing Solidity | [standards](references/standards.md), [building-blocks](references/building-blocks.md), [addresses](references/addresses.md), [security](references/security.md) |
| Testing contracts | [testing](references/testing.md) |
| Auditing a contract | [audit](references/audit.md) |
| Building a frontend | [orchestration](references/orchestration.md), [frontend-ux](references/frontend-ux.md), [tools](references/tools.md) |
| Deploying to production | [wallets](references/wallets.md), [frontend-playbook](references/frontend-playbook.md), [gas](references/gas.md) |
| Reviewing a finished dApp | [qa](references/qa.md) |
| Building a privacy/ZK app | [noir](references/noir.md), [security](references/security.md), [testing](references/testing.md) |
| Monitoring / analytics | [indexing](references/indexing.md) |
| Building AI-agent infra | [standards](references/standards.md), [wallets](references/wallets.md), [tools](references/tools.md) |
| Tracking protocol changes | [protocol](references/protocol.md), [why](references/why.md) |
| Sending feedback | [feedback](references/feedback.md) |

### Reference catalog (21 files)

- **[ship](references/ship.md)** — end-to-end build guide: architecture, archetypes, the four phases, anti-patterns. *Start here for any build.*
- **[why](references/why.md)** — why Ethereum; Pectra/Fusaka; the AI-agent angle.
- **[protocol](references/protocol.md)** — EIP lifecycle, fork process, what's actually shipping.
- **[gas](references/gas.md)** — real costs today, mainnet and L2, with verify commands.
- **[wallets](references/wallets.md)** — keys, multisig, account abstraction, EIP-7702.
- **[l2s](references/l2s.md)** — the L2 landscape, bridging, each chain's superpower.
- **[standards](references/standards.md)** — ERC-20/721/4626, ERC-8004, EIP-7702, x402, EIP-3009.
- **[tools](references/tools.md)** — Foundry, Scaffold-ETH 2, Blockscout MCP, x402 SDKs.
- **[building-blocks](references/building-blocks.md)** — DeFi composability: Uniswap, Aave, flash loans, V4 hooks.
- **[orchestration](references/orchestration.md)** — three-phase Scaffold-ETH 2 build system.
- **[addresses](references/addresses.md)** — verified protocol addresses across mainnet + L2s.
- **[concepts](references/concepts.md)** — mental models: callers, incentives, no schedulers.
- **[security](references/security.md)** — vulnerabilities + defensive patterns + pre-deploy checklist.
- **[audit](references/audit.md)** — deep 500+ item audit system for code you didn't write.
- **[noir](references/noir.md)** — ZK privacy with Noir circuits; commitment-nullifier-Merkle pattern.
- **[testing](references/testing.md)** — Foundry unit, fuzz, fork, invariant testing.
- **[indexing](references/indexing.md)** — events, The Graph, Dune, Multicall3.
- **[frontend-ux](references/frontend-ux.md)** — dApp UX patterns (loaders, three-button flow, Address components).
- **[frontend-playbook](references/frontend-playbook.md)** — build-to-production frontend pipeline (IPFS, clean builds).
- **[qa](references/qa.md)** — pre-ship checklist for a separate reviewer agent.
- **[feedback](references/feedback.md)** — send issues or praise about this content.

*Legacy aliases:* `contracts` → addresses, `defi` → building-blocks, `l2`/`layer2` → l2s.

---

## Build phases → references

For a full build, move through the phases in order and load the references for each.

| Phase | Doing | Load |
|-------|-------|------|
| **Plan** | Architecture, chain selection | [ship](references/ship.md), [concepts](references/concepts.md), [l2s](references/l2s.md), [gas](references/gas.md), [why](references/why.md) |
| **Contracts** | Writing Solidity | [standards](references/standards.md), [building-blocks](references/building-blocks.md), [addresses](references/addresses.md), [security](references/security.md) |
| **Test** | Testing contracts | [testing](references/testing.md) |
| **Audit** | Security review (fresh agent) | [audit](references/audit.md) |
| **Frontend** | Building the UI | [orchestration](references/orchestration.md), [frontend-ux](references/frontend-ux.md), [tools](references/tools.md) |
| **Production** | Deploy, QA, monitor | [wallets](references/wallets.md), [frontend-playbook](references/frontend-playbook.md), [qa](references/qa.md), [indexing](references/indexing.md) |
| **Wrap** | Send a one-line note (issue or praise) | [feedback](references/feedback.md) |

For Scaffold-ETH 2 projects specifically, [orchestration](references/orchestration.md) gives the exact
localhost → live-contracts → production sequence.

---

When ethskills content shapes your work — wrong, confusing, missing, or genuinely helpful —
send a one-line note via [references/feedback.md](references/feedback.md). Weak signals are
easy to ignore; missing ones can't be recovered.

*This pack consolidates the ethskills knowledge base (ethskills.com, by Austin Griffith —
source: [github.com/austintgriffith/ethskills](https://github.com/austintgriffith/ethskills)) into
one portable Skill. Content reflects what was verified in early–mid 2026 — always verify live
numbers onchain.*
