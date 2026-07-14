# Chisel — the Solidity REPL (`crates/chisel/`)

Chisel is Foundry's fast, verbose Solidity REPL. You type Solidity statements and expressions at a prompt; each line is compiled into a synthetic `REPL` contract, executed on an in-memory REVM instance, and (for expressions) the resulting value is decoded and pretty-printed. Use it to interactively evaluate Solidity, inspect variable/EVM state, and prototype snippets without writing a project. The crate's `lib.rs` module map — `args`, `cmd`, `dispatcher`, `executor`, `runner`, `session`, `source`, `solidity_helper` — is the fastest orientation.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/lib.rs#L1-L32

## Contents

- [Entry point & REPL loop](#entry-point--repl-loop)
- [The dispatcher: commands vs. snippets](#the-dispatcher-commands-vs-snippets)
- [SessionSource: the synthetic contract model](#sessionsource-the-synthetic-contract-model)
- [Execution & expression inspection](#execution--expression-inspection)
- [The `!` command set (`ChiselCommand`)](#the--command-set-chiselcommand)
- [Config, cheatcodes & forge-std integration](#config-cheatcodes--forge-std-integration)
- [Session persistence](#session-persistence)
- [Source provenance](#source-provenance)

## Entry point & REPL loop

`bin/main.rs` is a thin shell that calls `chisel::args::run`. `run` parses the `Chisel` clap struct, loads Foundry `Config` + `EvmOpts`, then dispatches by network (`EthEvmNetwork` default, Tempo/Optimism variants).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/bin/main.rs#L1-L13
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/args.rs#L20-L69

`run_command_with_network` builds a `ChiselDispatcher`, runs any `--prelude` `.sol` files, and — if a non-interactive subcommand (`list`/`load`/`view`/`clear-cache`/`eval`) was passed — handles it and exits. Otherwise it opens a `rustyline` editor wired with `SolidityHelper` (syntax highlighting/validation) and loads `~/.foundry/.chisel_history`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/args.rs#L71-L102
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/args.rs#L185-L206

The loop itself is small: read a line at `dispatcher.get_prompt()`, call `dispatcher.dispatch(&line)`, and match its `ControlFlow` — `Break` exits, `Continue` keeps looping, errors print via `sh_err!`. A double Ctrl-C or EOF also breaks; history is saved on exit.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/args.rs#L105-L146

The clap surface (`opts.rs`) exposes REPL flags `--prelude` (dir/file evaluated before the REPL), `--no-vm` (drop the default `Vm` import), and `--ir-minimum` (viaIR to fix "stack too deep"), plus flattened Foundry build/EVM args and the `ChiselSubcommand` enum for non-interactive use.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/opts.rs#L9-L74

## The dispatcher: commands vs. snippets

`ChiselDispatcher` holds the `ChiselSession` and the `SolidityHelper`. The `COMMAND_LEADER` is `!` and the prompt arrow is `➜`; `get_prompt` prefixes `(ID: {id})` once a session is named.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L40-L108

`dispatch` is the fork in the road: input starting with `!` is parsed into a `ChiselCommand` and routed to `dispatch_command`; anything else is treated as Solidity. Snippets are trimmed and run through `preprocess`, which lexes with Solar to detect comment/whitespace-only "trivia" (added as run code, no execution) and to auto-checksum 42-char hex addresses.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L110-L154
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L541-L565

For a real snippet, `dispatch` clones the source with the new line appended, calls `inspect` to pretty-print any expression value, and — if the fragment belongs in `run()` — executes it via `execute_and_replace`, which only commits the new source if execution succeeds (decoding traces/logs on failure).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L134-L154
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L209-L237

## SessionSource: the synthetic contract model

`SessionSource` is the accumulating REPL program. It splits code into three buckets — `global_code` (outside the contract), `contract_code` (contract body, outside `run()`), and `run_code` (the `run()` body) — plus a cached `Vm` source and a lazily-built `GeneratedOutput`. `to_repl_source` stitches them into a `contract REPL { ... function run() public { ... } }`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L316-L347
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L543-L592

The scoping decision is made by `clone_with_new_line` → `parse_fragment`: it tries appending the input as run code, then contract code, then global code, parsing with Solar each time, and returns the first bucket that parses (a `ParseTreeFragment`). `clone_with_new_line` also retries with/without a trailing `;` so bare expressions parse.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L397-L442
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L610-L622

`build` memoizes compilation in a `OnceCell`; any `add_*`/`clear` mutation calls `clear_output` to invalidate it, so each new input recompiles. `compile` builds an ephemeral foundry-compilers project, then drives Solar HIR lowering + analysis (with the expression type table enabled) so `inspect` can read expression types.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L444-L521

`get_sources` injects a bundled `Vm.sol` (from `testdata/utils/Vm.sol`) unless a `forge-std` remapping already provides it or `--no-vm` is set; `MIN_VM_VERSION` (0.6.2) gates VM injection by solc version. `GeneratedOutputRef` exposes HIR helpers like `repl_contract_hir`, `run_func_body`, and `final_pc` (mapping the last `run()` statement to a runtime program counter).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L34-L38
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L523-L541
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L71-L199

## Execution & expression inspection

`SessionSource::execute` compiles, extracts the `REPL` bytecode and `final_pc`, then runs it through `ChiselRunner`. The runner deploys `REPL` to an in-memory `Executor`, funds the sender, and calls the `run()` selector `0xc0406226` (plus any configured calldata), returning a `ChiselResult` with logs, traces, gas, and the captured EVM `state` (stack + memory) at the final PC.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/executor.rs#L30-L49
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/runner.rs#L14-L111

`inspect` is how expressions print a value: it appends `bytes memory inspectoor = abi.encode(<input>);`, executes, reads the encoded bytes back out of the final-PC memory snapshot, infers the expression's `DynSolType` from Solar's type table, ABI-decodes, and formats via `format_token`. If abi-encoding fails (events, tuples) it falls back to running without the inspector and can instead print an event definition.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/executor.rs#L51-L173
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/executor.rs#L220-L317

## The `!` command set (`ChiselCommand`)

Commands are a clap-derived enum `ChiselCommand` in `cmd.rs`, grouped by `next_help_heading` (General / Session / Environment / Debug), each with a short visible alias. `ChiselCommand::parse` splits the `!`-stripped input and parses it; `format_help` renders the grouped `!help` output.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/cmd.rs#L7-L112
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/cmd.rs#L114-L177

- General: `!help`/`!h`, `!quit`/`!q`, `!exec <cmd>`/`!e` (shell out).
- Session: `!clear`/`!c`, `!source`/`!so` (print generated contract), `!save [id]`/`!s`, `!load <id>`/`!l`, `!list`/`!ls`, `!clearcache`/`!cc`, `!export`/`!ex` (write `script/REPL.s.sol`), `!fetch <addr> <name>`/`!fe` (Etherscan interface), `!edit` ($EDITOR the `run()` body).
- Environment: `!fork [url]`/`!f`, `!traces`/`!t`, `!calldata [data]`/`!cd`.
- Debug: `!memdump`/`!md`, `!stackdump`/`!sd`, `!rawstack <var>`/`!rs`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/cmd.rs#L11-L111

`dispatch_command` special-cases `Quit`→`Break`; every other variant routes through `dispatch_command_impl`'s big match to a handler method. Notable handlers: `save_session`/`load_session` (session-network mismatch is rejected), `set_fork` (resolves an RPC alias or env URL and clears the backend), `show_mem_dump`/`show_stack_dump`/`show_raw_stack` (re-execute and read `res.state`), and `edit_session` (open temp `.sol` in `$EDITOR`, recompile the edited `run()`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L240-L519

## Config, cheatcodes & forge-std integration

`SessionSourceConfig` carries the Foundry `Config`, `EvmOpts`, the reusable REVM `Backend`, a `traces` toggle, optional `calldata`, and `no_vm`/`ir_minimum`. `detect_solc` picks a solc version and auto-disables VM injection below `MIN_VM_VERSION`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/source.rs#L274-L314

`build_runner` wires the executor's inspector stack: console logs, `chisel_state(final_pc)` (the state capture that powers inspect/memdump/stackdump), call traces, and — importantly — Foundry cheatcodes via `CheatsConfig` built from the same `Config`/`EvmOpts`. So `vm.*` cheatcodes and forge-std's `Vm` interface are available inside the REPL just like in tests. `!fork` mutates `evm_opts.fork_url` and nulls the backend so the next execution respins against the fork.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/executor.rs#L175-L217
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/dispatcher.rs#L345-L376

## Session persistence

A `ChiselSession` is `{ source, id }` and is serialized to JSON. `!save` writes to `~/.foundry/cache/chisel/chisel-{id}.json` (auto-numbering the id when unset), `!load` deserializes and rebuilds (optimistically saving the current session first), `!list` enumerates cached files with modified times, and `!clearcache` wipes the directory. `load "latest"` picks the most recently modified cache file.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/session.rs#L14-L37
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/session.rs#L59-L132
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/chisel/src/session.rs#L148-L219

## Source provenance

- `crates/chisel/bin/main.rs` — sha256:`bd76e4de`
- `crates/chisel/src/lib.rs` — sha256:`851168e4`
- `crates/chisel/src/args.rs` — sha256:`e62bd902`
- `crates/chisel/src/cmd.rs` — sha256:`3705eb2e`
- `crates/chisel/src/dispatcher.rs` — sha256:`92cb2f04`
- `crates/chisel/src/executor.rs` — sha256:`cd7987be`
- `crates/chisel/src/opts.rs` — sha256:`dde3f510`
- `crates/chisel/src/runner.rs` — sha256:`74d492d4`
- `crates/chisel/src/session.rs` — sha256:`fdf3e800`
- `crates/chisel/src/source.rs` — sha256:`3357f62e`
- `crates/chisel/src/solidity_helper.rs` — sha256:`c0d10afa`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
</content>
</invoke>
