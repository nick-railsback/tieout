# forge test — the Solidity testing framework

`forge test` compiles a project, discovers every test contract, deploys each one, and executes its test functions inside an in-process REVM instance. The orchestration lives in the `forge` crate (`crates/forge/src/`); the actual EVM execution and the fuzz/invariant engines live in the `foundry-evm` crate (`crates/evm/evm/src/executors/`). This reference covers how tests are found, classified, and run, and what a test author needs to know. The cheatcode catalog (the `vm` interface) has its own sibling reference — here it is only a pointer.

## Contents

- Discovery and the multi-contract runner
- Suite setup and test conventions
- Test kinds and how a function is classified
- Pass/fail semantics: revert, testFail, and DSTest `failed()`
- Fuzz tests (property testing)
- Invariant tests (stateful, handler-based)
- Filtering, traces, and verbosity
- Gas reporting
- Cheatcodes and forge-std

## Discovery and the multi-contract runner

`MultiContractRunner` is the top of the pipeline: it holds all compiled `TestContract`s and, in `test()`, spawns the shared `Backend`, collects the contracts matching the filter, and runs each suite. Suites are executed in parallel across the rayon thread pool via `contracts.par_iter()`, streaming each `SuiteResult` back over an mpsc channel as it finishes.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/multi_runner.rs#L207-L299

A "test contract" is any compiled contract; `matching_contracts` narrows the set by contract-name and path filters before any code runs, and `list` (used by `forge test --list`) enumerates matched functions without executing them. There is no naming requirement on the contract itself — convention is one contract per test suite, typically named `<Thing>Test` in a `*.t.sol` file.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/multi_runner.rs#L112-L178

## Suite setup and test conventions

Each suite is driven by a `ContractRunner`. `setup()` deploys the test contract from the sender account (nonce forced to 1 so addresses match DappTools), maxes out sender/caller balances, deploys any linked libraries, and then — if a single correctly-cased `setUp()` exists — invokes it. State from `setUp` persists into every test in that suite; each test then runs against a fresh copy of that post-setup state.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/runner.rs#L518-L563

`run_tests()` is where a suite's control flow lives: it warns on mis-cased `setUp`, hard-fails on multiple `setUp` or `afterInvariant` definitions, rejects parameterized `invariant_*` functions, forces call-tracing when invariants are present, runs setup, filters the ABI down to matched test functions, and finally dispatches each function. Functions within a suite are themselves run in parallel with `functions.par_iter()`, with a fail-fast `early_exit` gate that lets `-x`/`--fail-fast` stop sibling tests.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/runner.rs#L692-L1053

## Test kinds and how a function is classified

`TestFunctionKind::classify` is the single source of truth for what a function *is*, keyed purely on its name and whether it takes arguments: `test*` with no inputs is a unit test, `test*` with inputs is a fuzz test, and either becomes a "should fail" variant when the name starts with `testFail`. `invariant*` and `statefulFuzz*` are invariant tests, `table*` are table tests, `setUp`/`afterInvariant`/`fixture*` are reserved helpers, and `check*`/`prove*` become symbolic tests only when symbolic mode is enabled.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/common/src/traits.rs#L193-L219

The `TestFunctionKind` enum and its `is_*` predicates are what the runner matches on to route each function to the right executor. `is_any_test_fail` isolates the `testFail`/`testFail(...)` variants whose success condition is inverted.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/common/src/traits.rs#L170-L191

After filtering, `FunctionRunner::run` switches on the kind and calls `run_unit_test`, `run_fuzz_test`, `run_table_test`, `run_symbolic_test`, or `run_invariant_test`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/runner.rs#L1607-L1632

A unit test is the simplest case: the function is invoked once as an `eth_call`-style call from the sender, its state changes are discarded, and success is decided by `is_raw_call_mut_success`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/runner.rs#L1642-L1673

## Pass/fail semantics: revert, testFail, and DSTest `failed()`

Success is computed by `Executor::is_success`, which returns `should_fail ^ success` — so a `testFail*` test passes exactly when the underlying call fails. The raw success check fails the test if the call reverted, if a state-snapshot recorded a failure, or if the DSTest global failure slot is set; only when `legacy_assertions` is enabled does it fall back to calling `DSTest::failed()` on the contract. Modern tests should prefer `vm.expectRevert` and forge-std assertions over the legacy `testFail` prefix, which is coarse (any revert passes) and discouraged.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/evm/evm/src/executors/mod.rs#L806-L898

## Fuzz tests (property testing)

A fuzz test is any `test*` function with parameters: forge treats each parameter as a fuzzed input and turns the body into a property that must hold across many random cases. `FuzzedExecutor` wraps a proptest `TestRunner` and runs the function `runs` times (default 256), shrinking any counterexample and persisting it for deterministic replay. In this build the run budget is sharded across parallel workers via `into_par_iter`, then merged in `aggregate_results`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/evm/evm/src/executors/fuzz/mod.rs#L189-L267

`run_fuzz_test` wires this up on the `forge` side: it builds the fuzz "dictionary" state (address/value seeds harvested from storage and the ABI), constructs the `FuzzedExecutor`, runs the campaign, and on failure writes the minimized counterexample to the failure-persistence dir so the next `forge test` re-runs that exact input first.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/runner.rs#L3359-L3500

Defaults and knobs (`runs = 256`, `max_test_rejects = 65536`, `gas_report_samples = 256`) come from `FuzzConfig`; `vm.assume` rejects an input without counting it as a run, up to `max_test_rejects`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/fuzz.rs#L40-L50

## Invariant tests (stateful, handler-based)

Invariant testing is stateful fuzzing: instead of fuzzing one function's arguments, the engine builds long random *sequences* of calls into a set of target contracts ("handlers") and after each call re-checks that every `invariant*`/`statefulFuzz*` predicate still holds. The target/sender/selector set is discovered by calling the optional configuration functions on the test contract — `targetContracts`, `targetSenders`, `targetSelectors`, `targetArtifacts`, `targetInterfaces`, and their `exclude*` counterparts — defined here as the `IInvariantTest` Solidity interface.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/evm/evm/src/executors/invariant/mod.rs#L100-L149

`InvariantExecutor::invariant_fuzz` is the campaign entry point; each of `runs` runs applies up to `depth` random handler calls, and the fuzz dictionary evolves across the sequence so later calls reuse interesting values seen earlier.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/evm/evm/src/executors/invariant/mod.rs#L792-L893

Key defaults live in `InvariantConfig`: `runs = 256`, `depth = 500`, and `fail_on_revert = false` — meaning reverting handler calls are silently skipped by default, so an invariant only fails when a predicate is violated (or the whole sequence is reported as a counterexample when `fail_on_revert` is on). `call_override` enables reentrancy-style unsafe-call overriding.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/invariant.rs#L126-L146

On the `forge` side, `run_invariant_test` collects the live predicates, builds the executor with a seeded fuzzer, and runs the campaign; an optional `afterInvariant()` hook runs once at the end of each sequence for teardown-style checks.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/runner.rs#L2543-L2560

## Filtering, traces, and verbosity

`FilterArgs` defines the selection flags: `--match-test`/`-mt` and `--match-contract`/`-mc` take regexes, `--match-path`/`-mp` takes a glob, and each has a `--no-match-*` inverse. CLI filters are merged with the `foundry.toml` equivalents, so persistent filters can be configured per project.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/test/filter.rs#L28-L105

Verbosity (`-v` repeated) controls how much of each run is printed. Enabling `--gas-report` or trace output forces verbosity to at least 3. The per-trace rule is explicit: execution-call traces show at `-vvv` for failing tests or `-vvvv` for all tests, `setUp` traces show at `-vvvv` for failures or `-vvvvv` for all, and decoded console logs appear from `-vv` up.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/test/mod.rs#L1137-L1140

Traces are collected during execution, then decoded (against known contracts and signatures) and rendered only for the results that pass the verbosity gate above; `--suppress-successful-traces` further restricts rendering to failures.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/test/mod.rs#L1955-L1990

## Gas reporting

With `--gas-report`, `GasReport` walks the collected call traces and aggregates min/avg/median/max gas per function per contract. The `gas_reports` / `gas_reports_ignore` config fields (and `*`) select which contracts appear; a contract listed in both still gets a report, with a warning.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/gas_report.rs#L18-L60

## Cheatcodes and forge-std

Every test's superpowers — pranking senders, warping time, expecting reverts, mocking calls, reading files — come from the `vm` interface at the fixed cheatcode address, intercepted by the `Cheatcodes` inspector (`apply_cheatcode`) rather than being real EVM opcodes. forge-std provides the Solidity-side `Vm.sol` declarations plus `Test`/`DSTest` base contracts and assertion helpers a suite inherits. The full catalog is covered in the sibling cheatcodes reference; the dispatch entry point is here.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/inspector.rs#L799-L930

## Source provenance

- `crates/forge/src/multi_runner.rs` — sha256:`cdd0930b`
- `crates/forge/src/runner.rs` — sha256:`016fe6f5`
- `crates/forge/src/result.rs` — sha256:`0bccf46c`
- `crates/forge/src/gas_report.rs` — sha256:`25944179`
- `crates/forge/src/cmd/test/filter.rs` — sha256:`72fd2ea5`
- `crates/forge/src/cmd/test/mod.rs` — sha256:`2457bcff`
- `crates/common/src/traits.rs` — sha256:`74221811`
- `crates/evm/evm/src/executors/mod.rs` — sha256:`cc08a4fa`
- `crates/evm/evm/src/executors/fuzz/mod.rs` — sha256:`292a8135`
- `crates/evm/evm/src/executors/invariant/mod.rs` — sha256:`a1626b6c`
- `crates/config/src/fuzz.rs` — sha256:`62a20848`
- `crates/config/src/invariant.rs` — sha256:`560c5c9b`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
