# Foundry — Architecture & Repo Orientation

Foundry is a blazing-fast, portable, and modular toolkit for Ethereum application development, written in Rust. This reference is a mental map of the monorepo: what each of the four user-facing binaries does, how the shared library crates are layered underneath them, and which crate owns which behavior — so you know where to look before you start reading code.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/README.md#L26-L31

## Contents

- [The four binaries](#the-four-binaries)
- [Binary entry points](#binary-entry-points)
- [Workspace layout](#workspace-layout)
- [Shared library crates (who owns what)](#shared-library-crates-who-owns-what)
- [How the binaries compose the crates](#how-the-binaries-compose-the-crates)
- [Installation and forge-std](#installation-and-forge-std)
- [Source provenance](#source-provenance)

## The four binaries

Foundry ships four CLI tools, each backed by its own crate under `crates/`. **Forge** builds, tests, fuzzes, debugs, and deploys Solidity contracts (the Hardhat/Brownie analog). **Cast** is the Swiss Army knife for interacting with EVM contracts, sending transactions, and reading chain data. **Anvil** is a fast local Ethereum development node (akin to Hardhat Network). **Chisel** is a fast, verbose Solidity REPL. The README's tool list is the canonical one-liner for each.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/README.md#L28-L31

Each binary crate carries a matching library crate (`crates/forge`, `crates/cast`, `crates/anvil`, `crates/chisel`) whose `src/lib.rs` doc-comment restates its purpose, with the actual `main.rs` living under `bin/`. The library holds the command logic; the binary is a thin shim.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/lib.rs#L1-L1

## Binary entry points

Every binary follows the same tiny pattern: a `#[global_allocator]` from `foundry_cli::utils`, then a `main()` that calls the crate's `args::run()` and, on error, prints via `foundry_common::sh_err!` and exits non-zero. Forge, Anvil, and Chisel are nearly identical shims.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/bin/main.rs#L1-L14

Cast's `main.rs` is the one exception: when the shell is in JSON mode it walks the full error chain and emits a structured `JsonEnvelope` instead of a plain string, reflecting Cast's role as a scriptable data tool.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/bin/main.rs#L10-L31

Anvil and Chisel keep the minimal shim shape; the real parsing/dispatch lives behind each crate's `args::run()`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/bin/main.rs#L1-L13

`run()` for Forge shows the convention: check markdown-help, set up logging/subscriber, `Forge::parse()` the clap args, run global init, then dispatch to `run_command`. Every tool's CLI surface is a clap command tree parsed here.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/args.rs#L12-L21

## Workspace layout

The repo is a single Cargo workspace (resolver 2) whose `members` list enumerates the binary crates plus their sub-crates: Anvil splits into `anvil/{core,rpc,server}`, the EVM stack into `evm/{core,coverage,evm,fuzz,sancov,symbolic,hardforks,traces}`, and cheatcodes into `cheatcodes/{,spec}`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/Cargo.toml#L1-L33

All crates share one version and toolchain via `[workspace.package]` (version `1.7.2`, Rust edition 2024, MSRV 1.89), and internal crates are wired by path in `[workspace.dependencies]` — e.g. `forge-script` maps to `crates/script`, which is why the crate name and directory differ.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/Cargo.toml#L37-L46

## Shared library crates (who owns what)

The binaries stay thin because behavior is factored into shared crates. `foundry-common` holds cross-cutting utilities (shell/logging macros like `sh_err!`, console formatting); `foundry-config` owns all configuration (`foundry.toml`, figment-based layering, storage caching); `foundry-cli` holds common CLI plumbing (global args, the allocator, JSON envelopes) that every binary parses through.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/common/src/lib.rs#L1-L3

`foundry-config` is the single source of truth for settings and is depended on by every tool.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L1-L3

The EVM stack is the execution engine: `foundry-evm-core` (`crates/evm/core`) provides core EVM abstractions over revm, and `foundry-evm` (`crates/evm/evm`) is the main backend exposing `executors` and `inspectors` (including cheatcodes). Fuzzing, coverage, traces, and symbolic execution are sibling crates under `crates/evm`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/evm/evm/src/lib.rs#L1-L14

`foundry-cheatcodes` (`crates/cheatcodes`) implements the `vm.*` test/scripting cheatcodes as a revm inspector, with its spec (JSON-ABI of every cheatcode) split into `foundry-cheatcodes-spec` at `crates/cheatcodes/spec`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/lib.rs#L1-L3

`foundry-primitives` (`crates/primitives`) is a tiny crate of shared network/transaction types re-exported to the tools.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/primitives/src/lib.rs#L1-L6

Solidity-source tooling lives in three crates named `forge-*` but located under bare directories: `forge-fmt` (`crates/fmt`) is the Solidity formatter, `forge-lint` (`crates/lint`) the linter (`linter` + `sol` modules), and `forge-doc` (`crates/doc`) the documentation generator (builder/render/vocs).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/lint/src/lib.rs#L1-L7

`forge-doc`'s `DocBuilder` renders contract docs from the compiler HIR.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/doc/src/lib.rs#L1-L14

`forge-script` (`crates/script`) owns smart-contract scripting — building, executing, broadcasting, and receipt handling for `forge script`, with on-disk broadcast artifacts managed by the sibling `forge-script-sequence` (`crates/script-sequence`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/lib.rs#L1-L3

`forge-verify` (`crates/verify`) handles contract verification against Etherscan-style providers; `foundry-linking` (`crates/linking`) is the EVM bytecode library linker; `foundry-debugger` (`crates/debugger`) is the interactive Solidity step debugger; and `foundry-tui` (`crates/tui`) is the shared ratatui/crossterm terminal-UI layer the debugger and other TUIs build on.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/verify/src/lib.rs#L1-L13
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/linking/src/lib.rs#L1-L3
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/debugger/src/lib.rs#L1-L3
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/tui/src/lib.rs#L1-L1

## How the binaries compose the crates

Forge is the widest composer: its `Cargo.toml` pulls in `forge-doc`, `forge-fmt`, `forge-lint`, `forge-verify`, and `forge-script` (plus `foundry-evm`, `foundry-linking`, `foundry-debugger`, `foundry-cli`, `foundry-config`, `foundry-common`), so `forge fmt/lint/doc/verify/script/test` each delegate to a dedicated crate rather than to inline logic.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/Cargo.toml#L47-L51

Forge's own `lib.rs` exposes the command surface it keeps in-crate — `cmd`, `opts`, `coverage`, `gas_report`, `multi_runner`, `mutation`, `workspace`, `result` — while heavier features are the crates above.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/lib.rs#L16-L35

The other three binaries compose a narrower slice: Cast depends on the EVM stack, `foundry-debugger`, `foundry-primitives`, `foundry-wallets`, and `forge-fmt`; Chisel and Anvil lean on `foundry-evm`, `foundry-config`, and `foundry-common`, with Anvil additionally splitting its own logic across `anvil/{core,rpc,server}`. `foundry-cli` and `foundry-common` are the two crates common to all four.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/bin/main.rs#L4-L8

## Installation and forge-std

Users install via `foundryup`: the README's `curl -L https://foundry.paradigm.xyz | bash` bootstraps the `foundryup` script, which then downloads/builds the pinned toolchain. The installer script lives in-repo under `foundryup/`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/README.md#L35-L41
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/foundryup/foundryup#L8-L18

`forge-std` — the standard Solidity test/assertion library (`Test`, `Vm`, `console`) — is **not** in this repo; it is a separate `foundry-rs/forge-std` repository. `forge init` installs it into a new project's `lib/forge-std` as a git submodule dependency, which is where the on-chain test scaffolding comes from.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/init.rs#L255-L263

## Source provenance

- `README.md` — sha256:`b8bac263`
- `Cargo.toml` — sha256:`76911aef`
- `crates/forge/bin/main.rs` — sha256:`6170d1d3`
- `crates/cast/bin/main.rs` — sha256:`8ccc0b1d`
- `crates/anvil/bin/main.rs` — sha256:`014945ca`
- `crates/chisel/bin/main.rs` — sha256:`bd76e4de`
- `crates/forge/src/args.rs` — sha256:`c9a8b6cb`
- `crates/forge/src/lib.rs` — sha256:`2a175aa3`
- `crates/forge/Cargo.toml` — sha256:`40371e01`
- `crates/forge/src/cmd/init.rs` — sha256:`b64ad9f8`
- `crates/common/src/lib.rs` — sha256:`2e53a19c`
- `crates/config/src/lib.rs` — sha256:`a19c3d53`
- `crates/cli/src/lib.rs` — sha256:`5585fa21`
- `crates/primitives/src/lib.rs` — sha256:`605240cd`
- `crates/fmt/src/lib.rs` — sha256:`2a8efeb8`
- `crates/lint/src/lib.rs` — sha256:`facebcbc`
- `crates/doc/src/lib.rs` — sha256:`b8f209c2`
- `crates/linking/src/lib.rs` — sha256:`99be647e`
- `crates/tui/src/lib.rs` — sha256:`88a16dea`
- `crates/debugger/src/lib.rs` — sha256:`73cbac7e`
- `crates/verify/src/lib.rs` — sha256:`077d2bed`
- `crates/cheatcodes/src/lib.rs` — sha256:`7d661984`
- `crates/cheatcodes/spec/src/lib.rs` — sha256:`407d1d72`
- `crates/script/src/lib.rs` — sha256:`04dff194`
- `crates/evm/evm/src/lib.rs` — sha256:`cf30f8dd`
- `crates/evm/core/src/lib.rs` — sha256:`bd6e7751`
- `foundryup/foundryup` — sha256:`2c5df1f6`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
