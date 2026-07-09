---
name: viem-context
description: "Expert reference for viem, the TypeScript interface for Ethereum (v2.54.1): Clients & Transports, Public/Wallet/Test Actions, contract interaction, ABI encoding, accounts & signing, chains, ENS, core utilities, and error handling. Use when writing or debugging viem code or answering questions about its APIs, defaults, and patterns. References load on demand from references/."
---

<!-- BEGIN provisional-preamble (managed by skill-engine; do not hand-edit) -->
> **Heads up:** This contextualizer was last reviewed in *provisional* mode — the maintainer ran `/skill-engine:apply` to promote it but flagged the review as incomplete. Treat its claims as plausible but unverified; verify load-bearing claims by following the nearest permalink. Re-run `/skill-engine:refresh` and re-apply with `reviewed` to clear this notice.
<!-- END provisional-preamble -->

# Context navigator

## Overview

This navigator catalogs references for the viem library (registered source `wevm-viem`, https://github.com/wevm/viem). The navigator itself stays small; references load only when relevant to the current question.

When asked a question this navigator's domain covers:

1. Scan the **Catalog** below for the matching topic.
2. Follow the link to read the reference file.
3. If the question spans multiple references, consult the **Cross-reference map**.
4. If a reference points at a source URL for deeper detail, follow it only if the reference itself didn't answer the question.

## Claims policy

Cite by default, and make load-bearing claims verifiable:

1. **Inline-cite every load-bearing claim with its SHA-pinned permalink** — the `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<start>-L<end>` link the reference gives for that fact (versions, defaults, signatures, deprecations, behavior a user could get wrong by guessing). Put the permalink inline, on the claim. Use a bare filename parenthetical (e.g. *(reference-name.md)*) only when the reference genuinely provides no permalink. This inline permalink is what the grounded-citation eval (SELF-AUDIT Check 8) grades.
2. Don't cite orientational prose — *"what is X?"*, *"when did X launch?"* — answer those from this navigator alone; opening a reference is itself a citation gesture.
3. End with a one-line provenance footer, emitted italic, formatted `*References consulted: foo.md, bar.md. Grounded in {{LIBRARY}}@{{VERSION}} — [reference index]({{INDEX_URL}}).*` The footer is a **summary of what you read — not a substitute** for the inline permalinks on the claims. The `{{LIBRARY}}` / `{{VERSION}}` / `{{INDEX_URL}}` tokens are agent-substituted at answer time, so they appear literally in the stamped `SKILL.md`.
4. If no reference was opened, say so in the footer (*"Answered from general knowledge — no {{LIBRARY}} references consulted"*) — never fake it.

The voice is competent and careful — no "as an AI assistant" hedging.

## Catalog

References are grounded in viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Start at **Overview & Architecture** for the mental model, then jump to the topic reference.

| Reference | Description |
|---|---|
| [Overview & Architecture](references/wevm-viem-overview.md) | What viem is, installation, the Client + Transport + Actions mental model, module/subpath exports, and platform support. Start here. |
| [Clients & Transports](references/wevm-viem-clients-transports.md) | `createPublicClient` / `createWalletClient` / `createTestClient`, `client.extend`, and the `http` / `webSocket` / `custom` (EIP-1193) / `ipc` / `fallback` transports with their config and defaults. |
| [Public Actions](references/wevm-viem-public-actions.md) | Reading chain state: balances, blocks, transactions & receipts (`waitForTransactionReceipt`), `call`, gas & fee estimation, logs, filters, and `watch*` subscriptions. |
| [Wallet Actions](references/wevm-viem-wallet-actions.md) | Sending & signing: `sendTransaction`, `prepareTransactionRequest`, `signMessage` / `signTypedData`, account access, and `addChain` / `switchChain` / `watchAsset`. Local vs JSON-RPC account behavior. |
| [Contract Interaction](references/wevm-viem-contract.md) | `readContract`, `simulateContract` → `writeContract`, `getContract` instances, `multicall`, `deployContract`, contract events, and the encode/decode function/event/error/deploy codecs. |
| [ABI Encoding & Human-Readable ABIs](references/wevm-viem-abi.md) | `encodeAbiParameters` / `decodeAbiParameters`, `encodePacked`, `parseAbi*` human-readable signatures, `getAbiItem`, and the abitype type-inference relationship. |
| [Accounts & Signing](references/wevm-viem-accounts.md) | Local Accounts (private key / mnemonic / HD) vs JSON-RPC accounts, key generation, the `LocalAccount` signing interface, account hoisting, and nonce management. |
| [Chains](references/wevm-viem-chains.md) | The `Chain` object shape, importing prebuilt chains from `viem/chains`, `defineChain`, `extractChain` / `getChainContractAddress`, and chain-level fees / formatters / serializers. |
| [Core Utilities](references/wevm-viem-utilities.md) | Standalone helpers: hex/bytes data conversions, units (`parseEther` / `formatGwei`), hashing (`keccak256`, selectors), address (`getAddress` checksum, CREATE/CREATE2), and signature recovery/verification. |
| [ENS](references/wevm-viem-ens.md) | Name-resolution actions (`getEnsAddress` / `getEnsName` / `getEnsText` / `getEnsAvatar`) and utilities (`normalize`, `namehash`, `labelhash`), including the must-normalize-first gotcha. |
| [Errors & TypeScript](references/wevm-viem-errors-types.md) | The `BaseError` hierarchy and `.walk()` cause-chain matching, error-handling patterns, and viem's TypeScript design (branded `Address`/`Hex`/`Hash` types, Chain/Account inference, abitype). |
| [Test Actions (Anvil / Hardhat)](references/wevm-viem-test-actions.md) | `createTestClient` and node-manipulation actions: `mine`, `setBalance` / `setCode` / `impersonateAccount`, time control, `snapshot` / `revert` / `reset`, and mempool control. |

<!-- Catalog rows populate as references accumulate. Each row points at one primary in two possible shapes: file form references/<source-slug>-<topic>.md (default for text-only references) OR directory form references/<source-slug>-<topic>/ with the canonical primary <source-slug>-<topic>.md inside (opt-in for multimodal references that ship alongside non-.md assets like architecture diagrams, JSON schemas, or screenshots). Both forms are first-class; the bijection set-equality is computed over canonical reference IDs. See https://github.com/nick-railsback/skill-engine/blob/main/plugin/skill-engine/docs/02-artifact-contract.md "### Reference depth (one level)" for the directory-form contract. The DISCOVER pipeline (chapter https://github.com/nick-railsback/skill-engine/blob/main/plugin/skill-engine/docs/08-discover-pipeline.md) adds rows on its emit pass; the navigator's /self-audit workflow keeps them in 1:1 correspondence with the references/ directory. -->

## Cross-reference map

Start at the reference listed first; the others carry the supporting detail.

- **Send a contract transaction** → `wevm-viem-contract.md` (`simulateContract` → `writeContract`), then `wevm-viem-accounts.md` for the signer and `wevm-viem-wallet-actions.md` for the underlying send/prepare pipeline.
- **Read contract state or events** → `wevm-viem-contract.md`; drop to `wevm-viem-abi.md` for the raw parameter codec, or `wevm-viem-public-actions.md` for raw `getLogs`/filters.
- **Choose a client & transport** → `wevm-viem-overview.md` for the Client+Transport+Actions model, then `wevm-viem-clients-transports.md` for the concrete constructors and transport options.
- **Sign then verify a message / typed data** → `wevm-viem-accounts.md` (`LocalAccount.signMessage`) or `wevm-viem-wallet-actions.md` (`client.signMessage`) to sign; `wevm-viem-utilities.md` (`verifyMessage` / `recoverMessageAddress`) to verify.
- **Estimate gas & fees** → `wevm-viem-public-actions.md` (`estimateGas` / `estimateFeesPerGas` / `getFeeHistory`); `wevm-viem-chains.md` for chain-level fee config (`baseFeeMultiplier`, custom `fees`).
- **Resolve an ENS name before acting** → `wevm-viem-ens.md` (`normalize` → `getEnsAddress`), then `wevm-viem-wallet-actions.md` / `wevm-viem-contract.md` with the resolved address.
- **Debug a revert or RPC error** → `wevm-viem-errors-types.md` (`error.walk(...)` to reach `ContractFunctionRevertedError`), alongside `wevm-viem-contract.md` for the call that threw.
- **Set up a local test harness** → `wevm-viem-test-actions.md` (`createTestClient`, snapshot/revert), with `wevm-viem-clients-transports.md` for the transport.

<!-- Cross-reference entries describe which reference to start at when a question spans multiple subsystems. Add entries as patterns emerge from real usage; the DISCOVER pipeline does not auto-generate these. -->

## Markdown style for generated references

Reference files use **soft wrapping**: one paragraph per line, no hard line breaks at fixed column widths. Editors and rendered Markdown reflow at viewport width. Do not insert manual line breaks within a paragraph to keep lines under ~80 columns — that produces mid-sentence breaks in rendered output and makes diffs noisier. Code blocks, tables, bullet lists, and headings follow their own rules; this directive applies to prose paragraphs only.

## Instructions to Claude

When loading a reference file, the path syntax depends on the platform:

* **Claude Code**: Read the reference using the platform-provided skill-directory variable: `Read $CLAUDE_SKILL_DIR/references/<source-slug>-<topic>.md`

* **Claude Desktop**: Read the reference using a relative path; the platform resolves it from the skill's installed location: `Read references/<source-slug>-<topic>.md`

Loading rules:

* Load one reference at a time unless the Cross-reference map says to load both.
* If the primary reference doesn't fully answer the question, follow any source URL pointers it provides for deeper detail.
* Do not eagerly load companion files; only follow companion links when the primary reference says to.
* If the user's question is clearly out of scope for this contextualizer, don't invoke this skill at all.

## Progressive disclosure

References prioritize curated insight over re-specifying upstream sources:

* **Gotchas, cross-system patterns, and "why" context** are kept in the reference (curation value).
* **Exact schemas, API signatures, and parameter lists** are summarized in the reference and linked to their authoritative source via source URLs.

When a reference includes a source URL pointer, follow it only when the reference's own summary didn't cover the question. The contextualizer is optimized for the common case; the upstream source is the long tail.

## Optional SKILL.json sibling

This navigator MAY ship a `SKILL.json` sibling alongside this `SKILL.md` for machine-readable consumers (downstream tools and non-Claude agents that prefer structured metadata to markdown parsing). The sibling is purely opt-in additive — contextualizers without it pass verification unchanged.

When `SKILL.json` is present, the `## Catalog` table above, the SKILL.json `catalog[]` entries, and the `references/<source-slug>-*.md` files on disk must be in three-way correspondence. Entries carrying `"draft": true` in SKILL.json are excluded from this trijection and surface as a one-line summary at verify time. The `skill-json-trijection` named check fires only when SKILL.json is present; absence is a silent-skip pass.

Full schema: see [`02-artifact-contract.md`](https://github.com/nick-railsback/skill-engine/blob/main/plugin/skill-engine/docs/02-artifact-contract.md) §"SKILL.json".
