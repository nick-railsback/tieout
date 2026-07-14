# forge: build → deploy → verify → script lifecycle

This reference maps the non-testing half of the `forge` CLI: compiling contracts (`build`), deploying a single contract (`create`), Solidity scripting (`script`), verifying source (`verify-contract`), and the ancillary `fmt` / `lint` / `doc` tools. Testing, cheatcodes, and config are covered by sibling references — those are pointers here. The binary is a thin wrapper: `main.rs` calls `forge::args::run()` and exits non-zero on error.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/bin/main.rs#L1-L14

## Contents

- [Command surface](#command-surface) — the clap subcommand enum and dispatch
- [Crate map](#crate-map) — which crate implements what
- [forge build](#forge-build) — compilation pipeline, artifacts, cache
- [forge create](#forge-create) — single-contract deploy
- [forge script](#forge-script) — scripting state machine, dry-run vs broadcast
- [Transaction sequences](#transaction-sequences) — the `broadcast/` and `cache/` JSON
- [Contract verification](#contract-verification) — Etherscan / Sourcify / Blockscout
- [fmt, lint, doc](#fmt-lint-doc)
- [Source provenance](#source-provenance)

## Command surface

The top-level parser is `struct Forge` (clap `Parser`) with flattened `GlobalArgs` plus a `ForgeSubcommand` enum. Each variant wraps an args struct from `crates/forge/src/cmd/` (or an external crate for `script`/`verify`), most carrying a `visible_alias` (e.g. `b`/`compile` for build, `c` for create, `v` for verify-contract, `cl` for clean).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/opts.rs#L16-L176

`args::run()` sets up the logger, parses `Forge`, then `run_command()` matches the subcommand. Before dispatch it derives a `ForgeContext` (Test / Script{DryRun,Resume,Broadcast} / Snapshot / …) from the subcommand and its flags so cheatcodes know the execution mode. Most subcommands are async and run via `global.block_on(...)`; sync ones (`config`, `flatten`, `remappings`) run inline.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/args.rs#L33-L149

`Clean` is inlined directly in the dispatcher (it loads config, builds the project, and calls `config.cleanup(&project)` to wipe `out/` and `cache/`); `install`/`remove`/`update`/`remappings` live in `crates/forge/src/cmd/`. `test` and `snapshot` are dispatched here too but documented in the testing reference.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/args.rs#L105-L119

## Crate map

- `crates/forge/` — the CLI: subcommand enum (`opts.rs`), dispatch (`args.rs`), and per-command impls under `src/cmd/` (`build.rs`, `create.rs`, `clean` via dispatcher, `install.rs`, `remappings.rs`, `fmt.rs`, `lint.rs`, `doc.rs`, `inspect.rs`, …).
- `crates/script/` — `forge script`: the whole run/build/execute/simulate/broadcast pipeline (`ScriptArgs` lives here, re-exported into the enum).
- `crates/script-sequence/` — on-disk transaction sequences (`ScriptSequence`) written to `broadcast/` and `cache/`.
- `crates/verify/` — `forge verify-contract` / `verify-check` / `verify-bytecode`, with Etherscan / Sourcify / Blockscout / Oklink / Custom providers.
- `crates/fmt/`, `crates/lint/`, `crates/doc/` — the formatter, Solidity linter, and mdbook-style doc generator, each driven by a thin `cmd/*.rs` wrapper.
- `crates/common/src/compile.rs` — `ProjectCompiler`, the shared compile driver used by build, script, and verify.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/opts.rs#L1-L13
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/common/src/compile.rs#L41-L41

## forge build

`BuildArgs` implements `figment::Provider`, so CLI flags (`--names`, `--sizes`, `--ignore-eip-3860`, `--no-lint`, plus flattened `BuildOpts`) merge into `Config` at highest precedence. `run()` loads config, installs any missing dependencies, checks `soldeer.lock`/`foundry.lock` consistency, then builds the `Project`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/build.rs#L48-L114

The compile itself is `ProjectCompiler::new().files(...).print_names().print_sizes().ignore_eip_3860().size_limits(...).compile(&project)`. Artifacts land in `out/` and the incremental solc cache in `cache/` (both from `Config`); `compile()` skips unchanged sources via that cache. After compiling it caches local function selectors and, unless `--no-lint`/`lint_on_build=false`, runs the Solidity linter on the sources.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/build.rs#L116-L151

The post-build lint (`fn lint`) spins up a solar `Compiler` with typeck enabled, feeds it the solc-compatible sources, and runs `SolidityLinter` honoring `[lint]` severity/exclude/ignore config; failures print a bug-report notice and abort the build.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/build.rs#L153-L233

## forge create

`CreateArgs` deploys one contract identified by `<path>:<name>`, with `--constructor-args`/`--constructor-args-path`, `--broadcast` (off = simulate only), `--verify`, `--unlocked`, and flattened build/tx/eth/verifier opts. `run()` resolves the chain (from `--chain` or an RPC `eth_chainId`) and dispatches to `run_generic::<N>` for either the Ethereum or Tempo network.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/create.rs#L49-L151

`run_generic` compiles/links, ABI-encodes constructor params, then branches on signer kind (browser wallet, `--unlocked` `eth_sendTransaction`, Tempo access key, or a local signer) and calls `deploy(...)`. `deploy` builds the CREATE transaction, sends or simulates it, prints `Deployer` / `Deployed to` / `Transaction hash`, and (if `--verify`) hands off to the verify crate.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/create.rs#L205-L329
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/create.rs#L407-L679

## forge script

`ScriptArgs` (in `crates/script/`) targets a contract path + `--sig` (default `run()`), with the key flags `--broadcast`, `--resume`, `--multi`, and `--verify`. `run_script()` resolves EVM opts, then boxes and drives one of the network-specific pipelines (`EthEvmNetwork`, `TempoEvmNetwork`, optional `OpEvmNetwork`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/lib.rs#L92-L143
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/lib.rs#L328-L382

The pipeline is an explicit typestate machine in `build.rs`/`execute.rs`: `PreprocessedState → CompiledState → LinkedState → prepare_execution → execute → prepare_simulation → fill_metadata → bundle → BundledState`. `--resume` short-circuits `CompiledState::resume()` straight to `BundledState` by reloading the saved sequence instead of re-executing.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/build.rs#L193-L301
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/lib.rs#L384-L466

`prepare_bundled()` is where dry-run vs broadcast diverges: it runs the EVM simulation, shows traces/JSON, checks contract sizes, and — if `should_broadcast()` is false (no `--broadcast`/`--resume`/`--verify`) — prints "SIMULATION COMPLETE. To broadcast … add --broadcast" and returns `None` without sending anything. Only when broadcasting does it run a verify preflight and continue.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/lib.rs#L468-L507

`BundledState::broadcast()` (in `broadcast.rs`) collects the remaining unsigned transactions, refuses Foundry's default sender, resolves signers per `from` address, estimates gas, and streams the txes onchain, saving receipts back into the sequence. A Tempo-only `broadcast_batch()` bundles all `vm.broadcast()` calls into one batch tx.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script/src/broadcast.rs#L442-L520

## Transaction sequences

`crates/script-sequence/` persists a run as `ScriptSequence<N>`: a queue of `TransactionWithMetadata`, the receipts, deployed-library list, pending hashes, return values, timestamp, chain id, and git commit. `save`/`load` split sensitive data (RPC URLs) into a parallel file under `cache/`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script-sequence/src/sequence.rs#L37-L117

`get_paths()` writes to `./broadcast/[file]/[chain_id]/[sig]-latest.json` (and a mirror under `cache/`), inserting a `dry-run/` segment for un-broadcast runs. These are the `run-latest.json` files scripts leave behind and that `--resume` reads back.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script-sequence/src/sequence.rs#L15-L15
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/script-sequence/src/sequence.rs#L189-L223

## Contract verification

`crates/verify/` exposes `VerifyArgs` (`verify-contract`), `VerifyCheckArgs` (`verify-check`), and `VerifyBytecodeArgs` (`verify-bytecode`). `VerifyArgs` carries the address, `<path>:<name>`, constructor args, compiler version/profile, `--flatten`, `--watch`, and a flattened `VerifierArgs`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/verify/src/lib.rs#L1-L29
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/verify/src/verify.rs#L147-L360

Providers are abstracted by the `VerificationProvider` trait (`preflight_verify_check` → `submit` → optional `check`/`watch`). The `VerificationProviderType` enum is `Etherscan | Sourcify (default) | Blockscout | Oklink | Custom`; only Etherscan and Sourcify have concrete impls (`etherscan/`, `sourcify.rs`) — Blockscout/Oklink/Custom route through the Etherscan-compatible client.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/verify/src/provider.rs#L107-L199

`VerifyArgs::run()` resolves the chain (RPC or default), sets the Etherscan key from config, then `VerifierArgs::resolve()` picks the provider: explicit `--verifier` wins, else `ETHERSCAN_API_KEY` + supported chain → Etherscan, else Sourcify (auto-injecting the chain's Sourcify URL). The Etherscan provider can flatten or send standard-JSON input (`provider/flatten.rs`, `provider/standard_json.rs`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/verify/src/verify.rs#L549-L608
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/verify/src/provider.rs#L207-L280

## fmt, lint, doc

`forge fmt` (`crates/fmt/`) is a solar-based pretty-printer returning a `DiagnosticsResult`; the `cmd/fmt.rs` wrapper adds `--check` (exit 1 if reformatting is needed) and stdin mode, and formats `src`/`test`/`script` while skipping ignored/lib dirs.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/fmt/src/lib.rs#L1-L53
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/fmt.rs#L34-L52

`forge lint` (`crates/lint/`) exposes `linter` (early/late passes, project driver) and `sol` (the lint catalog: gas, high/med/low/info severities, naming, codesize). `cmd/lint.rs` builds a `SolidityLinter` and runs it over the input files; the deprecated `geiger` command is just `forge lint --only-lint unsafe-cheatcode`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/lint/src/lib.rs#L1-L7
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/lint.rs#L41-L132

`forge doc` (`crates/doc/`) generates a vocs/mdbook-style site: `DocBuilder::build(&mut compiler)` walks the HIR, renders Markdown into `out_dir()` (default `docs/`), and returns `BuildStats`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/doc/src/lib.rs#L1-L14
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/doc/src/builder.rs#L56-L87

## Source provenance

- `crates/forge/bin/main.rs` — sha256:`6170d1d3`
- `crates/forge/src/opts.rs` — sha256:`82868038`
- `crates/forge/src/args.rs` — sha256:`c9a8b6cb`
- `crates/forge/src/cmd/build.rs` — sha256:`6e8ed218`
- `crates/forge/src/cmd/create.rs` — sha256:`01fc360f`
- `crates/forge/src/cmd/fmt.rs` — sha256:`65c3e938`
- `crates/forge/src/cmd/lint.rs` — sha256:`3becf5c7`
- `crates/script/src/lib.rs` — sha256:`04dff194`
- `crates/script/src/build.rs` — sha256:`3b4e35bd`
- `crates/script/src/broadcast.rs` — sha256:`15aece3c`
- `crates/script-sequence/src/sequence.rs` — sha256:`b63d7b07`
- `crates/verify/src/lib.rs` — sha256:`077d2bed`
- `crates/verify/src/verify.rs` — sha256:`274c15ff`
- `crates/verify/src/provider.rs` — sha256:`12a6f359`
- `crates/fmt/src/lib.rs` — sha256:`2a8efeb8`
- `crates/lint/src/lib.rs` — sha256:`facebcbc`
- `crates/doc/src/lib.rs` — sha256:`b8f209c2`
- `crates/doc/src/builder.rs` — sha256:`869c64a8`
- `crates/common/src/compile.rs` — sha256:`70414f82`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
