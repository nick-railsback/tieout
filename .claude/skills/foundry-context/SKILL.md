---
name: foundry-context
description: "Answers questions about Foundry — the Rust toolkit for Ethereum development (forge, cast, anvil, chisel). Use when writing or running Solidity tests/scripts, using cheatcodes, configuring foundry.toml, interacting with an EVM chain via cast, or running a local node with anvil. References load on demand from references/."
---

# Foundry context navigator

## Overview

This navigator catalogs references for Foundry (github.com/foundry-rs/foundry), the blazing-fast, modular Ethereum development toolkit written in Rust. The navigator itself stays small; references load only when relevant to the current question.

When asked a question this navigator's domain covers:

1. Scan the **Catalog** below for the matching topic.
2. Follow the link to read the reference file.
3. If the question spans multiple references, consult the **Cross-reference map**.
4. If a reference points at a source URL for deeper detail, follow it only if the reference itself didn't answer the question.

## Claims policy

Cite by default, and make load-bearing claims verifiable:

1. **Inline-cite every load-bearing claim with its SHA-pinned permalink** — the `https://github.com/foundry-rs/foundry/blob/<sha>/<path>#L<start>-L<end>` link the reference gives for that fact (flags, defaults, cheatcode signatures, config keys, RPC method names, behavior a user could get wrong by guessing). Put the permalink inline, on the claim. Use a bare filename parenthetical (e.g. *(foundry-rs-foundry-cast.md)*) only when the reference genuinely provides no permalink.
2. Don't cite orientational prose — *"what is anvil?"*, *"what are the four tools?"* — answer those from this navigator alone; opening a reference is itself a citation gesture.
3. End with a one-line provenance footer, emitted italic, formatted `*References consulted: foo.md, bar.md. Grounded in foundry@f1bcb75 — [reference index](https://github.com/foundry-rs/foundry).*`
4. If no reference was opened, say so in the footer (*"Answered from general knowledge — no Foundry references consulted"*) — never fake it.

The voice is competent and careful — no "as an AI assistant" hedging.

## Catalog

References are pinned to Foundry commit `f1bcb750977289c434f0f9576b09898541e1aaa7`. Each row points at one reference file.

| Reference | Description |
|---|---|
| [Overview & architecture](references/foundry-rs-foundry-overview.md) | What Foundry is; the four binaries (forge, cast, anvil, chisel); the Cargo workspace and which shared crate owns which behavior. Start here for orientation. |
| [forge test — testing framework](references/foundry-rs-foundry-forge-testing.md) | Writing and running Solidity tests: unit, fuzz, and invariant tests; the multi-contract runner, traces, gas reporting, and test filtering. |
| [Cheatcodes (`vm.*`)](references/foundry-rs-foundry-cheatcodes.md) | The `vm` interface tests and scripts use to manipulate EVM state: prank/deal/warp, expectRevert/expectEmit, mockCall, forking, fs/ffi; the spec-driven design. |
| [cast — EVM CLI](references/foundry-rs-foundry-cast.md) | The "Swiss Army knife" for EVM chains: chain/state queries, sending transactions, ABI encode/decode, unit conversions, wallet & signing. |
| [anvil — local node](references/foundry-rs-foundry-anvil.md) | The fast local Ethereum node: JSON-RPC server, mainnet forking, mining modes, and the custom `anvil_*` / `evm_*` cheat RPC methods. |
| [Configuration (`foundry.toml`)](references/foundry-rs-foundry-config.md) | The shared `Config` system: profiles, compiler and test keys, remappings, `[rpc_endpoints]` / `[etherscan]`, and precedence/merge rules. |
| [forge build / create / script / verify](references/foundry-rs-foundry-forge-build-script.md) | The compile → deploy → script → verify lifecycle beyond testing, plus `forge fmt` / `lint` / `doc`; which crate implements what. |
| [chisel — Solidity REPL](references/foundry-rs-foundry-chisel.md) | The verbose Solidity REPL: the session/dispatch loop, the `SessionSource` recompile model, and the built-in `!` commands. |

## Cross-reference map

*Start-here guidance when a question spans multiple references. Reference files are named by slug here (not linked) so the Catalog above stays the single source of each link; open them from the Catalog.*

- **Writing a test that uses `vm.something`** — start at `foundry-rs-foundry-forge-testing.md` for the test harness, then follow to `foundry-rs-foundry-cheatcodes.md` for the specific cheatcode's signature and semantics.
- **Deploying or scripting** — start at `foundry-rs-foundry-forge-build-script.md`; for wallet/signing details cross to `foundry-rs-foundry-cast.md`, and for RPC/Etherscan endpoints cross to `foundry-rs-foundry-config.md`.
- **Fork testing** — spans `foundry-rs-foundry-cheatcodes.md` (`createFork`/`selectFork`/`rollFork`) and `foundry-rs-foundry-anvil.md` (`--fork-url` and the forked backend).
- **How a config key changes test behavior** — spans `foundry-rs-foundry-config.md` (the `[fuzz]`/`[invariant]` tables, `evm_version`) and `foundry-rs-foundry-forge-testing.md`.
- **"Which crate implements X?"** — `foundry-rs-foundry-overview.md` has the workspace map.

## Markdown style for generated references

Reference files use **soft wrapping**: one paragraph per line, no hard line breaks at fixed column widths. Editors and rendered Markdown reflow at viewport width. Code blocks, tables, bullet lists, and headings follow their own rules; this directive applies to prose paragraphs only.

## Instructions to Claude

When loading a reference file, the path syntax depends on the platform:

* **Claude Code**: `Read $CLAUDE_SKILL_DIR/references/<source-slug>-<topic>.md`
* **Claude Desktop**: `Read references/<source-slug>-<topic>.md`

Loading rules:

* Load one reference at a time unless the Cross-reference map says to load both.
* If the primary reference doesn't fully answer the question, follow any source URL pointers it provides for deeper detail.
* Do not eagerly load companion files; only follow companion links when the primary reference says to.
* If the user's question is clearly out of scope for this contextualizer, don't invoke this skill at all.

## Progressive disclosure

References prioritize curated insight over re-specifying upstream sources:

* **Gotchas, cross-system patterns, and "why" context** are kept in the reference (curation value).
* **Exact schemas, API signatures, and parameter lists** are summarized in the reference and linked to their authoritative source via SHA-pinned permalinks.

When a reference includes a source URL pointer, follow it only when the reference's own summary didn't cover the question. The contextualizer is optimized for the common case; the upstream source is the long tail.
